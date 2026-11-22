import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { invite } from '../t94-config'

import { connectAdmin, createUser } from './helpers'

// admin_org_transfer_owner (1930) against real concurrent transactions (case 6 and case 3 of the
// migration header): one connection holds an open transfer while another binds a customer,
// redeems an org member's invite code, or pays. Fixtures are committed (each racing transaction
// needs to see them); the affiliate switch is turned on only inside the racing transactions,
// which are rolled back.

let setup: Client
let racer: Client
let mover: Client
beforeAll(async () => { [setup, racer, mover] = await Promise.all([connectAdmin(), connectAdmin(), connectAdmin()]) })
afterAll(async () => { await Promise.all([setup.end(), racer.end(), mover.end()]) })

const one = async (db: Client, sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows[0]

async function committedOrg() {
  const actor = await createUser(setup)
  await setup.query("update profiles set role='admin' where id=$1", [actor])
  const owner = await createUser(setup)
  const { id: orgId } = await one(setup, 'select admin_org_create($1,$2) as id', [actor, { owner_user_id: owner, name: 'Race ' + owner.slice(0, 8), affiliate_enabled: true }])
  const staff = await createUser(setup)
  const { invite_token } = await one(setup, 'select invite_token from orgs where id=$1', [orgId])
  await setup.query('select org_join($1,$2)', [staff, invite_token])
  const { slug } = await one(setup, 'select slug from affiliates where user_id=$1', [owner])
  return { actor, owner, orgId: orgId as string, staff, slug: slug as string }
}

// Opens the transfer on `mover` and leaves it uncommitted (it holds the org's affiliates row).
async function openTransfer(actor: string, orgId: string, to: string) {
  const { at } = await one(setup, 'select updated_at::text as at from orgs where id=$1', [orgId])
  await mover.query('begin')
  await mover.query('select admin_org_transfer_owner($1,$2)', [actor, { org_id: orgId, user_id: to, expected_updated_at: at }])
}
// Runs `work` on `racer` in a transaction with the affiliate switch on; it must block on the
// open transfer, which is then committed. Returns what `read` saw inside the racer's transaction.
async function race<T>(work: () => Promise<unknown>, read: () => Promise<T>): Promise<T> {
  await racer.query('begin')
  await racer.query('update affiliate_settings set enabled=true')
  let settled = false
  const running = work().finally(() => { settled = true })
  await new Promise((resolve) => setTimeout(resolve, 300))
  expect(settled).toBe(false)
  await mover.query('commit')
  await running
  try { return await read() } finally { await racer.query('rollback') }
}

it('binds a customer through the slug to the new owner when the bind races the transfer', async () => {
  const { actor, orgId, staff, slug } = await committedOrg()
  const customer = await createUser(setup)
  await openTransfer(actor, orgId, staff)
  const seen = await race(
    () => racer.query("select affiliate_bind($1,$2,'signup')", [customer, slug]),
    () => one(racer, 'select referred_by from profiles where id=$1', [customer]),
  )
  expect(seen).toEqual({ referred_by: staff })
})

it('attributes an invitee of an org member to the new owner when the redemption races the transfer', async () => {
  const { actor, orgId, owner, staff } = await committedOrg()
  const member = await createUser(setup)
  const { invite_token } = await one(setup, 'select invite_token from orgs where id=$1', [orgId])
  await setup.query('select org_join($1,$2)', [member, invite_token])
  const { code } = await one(setup, 'select get_or_create_invite_code($1) as code', [member])
  const customer = await createUser(setup)
  await setup.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [customer, 'signup:' + customer])
  await openTransfer(actor, orgId, staff)
  const seen = await race(
    () => racer.query("select redeem_code($1,$2,'signup',null,$3)", [customer, code, invite.windowDays]),
    () => one(racer, `select p.referred_by, p.referred_member,
        (select count(*)::int from org_attribution_errors e join code_redemptions r on r.id=e.redemption_id where r.user_id=p.id) as errors
      from profiles p where p.id=$1`, [customer]),
  )
  expect(seen).toEqual({ referred_by: staff, referred_member: member, errors: 0 })
  expect(owner).not.toBe(staff)
})

it('books a payment racing the transfer to the org', async () => {
  const { actor, orgId, owner, staff } = await committedOrg()
  const customer = await createUser(setup)
  await setup.query("update profiles set referred_by=$1,referred_source='signup',referred_at=now() where id=$2", [owner, customer])
  await openTransfer(actor, orgId, staff)
  const charge = 'ch_' + randomUUID()
  const seen = await race(
    () => racer.query("select settle_checkout($1,'pack_m',$2,2490,'usd',0,'card',null,$3)", [customer, 'cs_race_' + randomUUID(), charge]),
    async () => {
      const { id } = await one(racer, 'select id from payments where stripe_charge_id=$1', [charge])
      // Depending on which lock it met first, the payment waited for the commit and read the new
      // binding, or lost a deadlock and stored its old-owner snapshot for the retry: both end on
      // the new owner once the retry has run.
      await racer.query('select affiliate_recompute_payment($1)', [id])
      return one(racer, 'select affiliate_user_id from affiliate_commissions where payment_id=$1 and level=1', [id])
    },
  )
  expect(seen).toEqual({ affiliate_user_id: staff })
  expect(owner).not.toBe(staff)
})
