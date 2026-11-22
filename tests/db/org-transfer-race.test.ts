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
// Until the backend `pid` waits on a lock (pg_stat_activity), so a race really interleaves.
async function waitsOnLock(pid: number) {
  for (let i = 0; i < 100; i++) {
    const r = await one(setup, "select wait_event_type = 'Lock' as waiting from pg_stat_activity where pid = $1", [pid])
    if (r?.waiting) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('never waited on a lock')
}
const pidOf = async (db: Client) => (await one(db, 'select pg_backend_pid() as pid')).pid as number

// Runs `work` on `racer` in a transaction with the affiliate switch on; it must block on the
// open transfer, which is then committed. Returns what `read` saw inside the racer's transaction.
async function race<T>(work: () => Promise<unknown>, read: () => Promise<T>): Promise<T> {
  await racer.query('begin')
  await racer.query('update affiliate_settings set enabled=true')
  const pid = await pidOf(racer)
  const running = work()
  await waitsOnLock(pid)
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
      // The payment waited for the commit and read the new binding (a payment that read the old
      // one first stores it for the retry, which remaps by org: case 3).
      await racer.query('select affiliate_recompute_payment($1)', [id])
      return one(racer, 'select affiliate_user_id from affiliate_commissions where payment_id=$1 and level=1', [id])
    },
  )
  expect(seen).toEqual({ affiliate_user_id: staff })
  expect(owner).not.toBe(staff)
})

// An org with two affiliate levels, and one org_l1 customer of the owner's staff member.
async function levelTwoOrg() {
  const base = await committedOrg()
  await setup.query('update orgs set affiliate_levels=2 where id=$1', [base.orgId])
  const { code: staffCode } = await one(setup, 'select get_or_create_invite_code($1) as code', [base.staff])
  const inviter = await createUser(setup)
  await setup.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [inviter, 'signup:' + inviter])
  // org_l1 binding committed with the switch on only inside this transaction.
  await setup.query('begin')
  await setup.query('update affiliate_settings set enabled=true')
  await setup.query("select redeem_code($1,$2,'signup',null,$3)", [inviter, staffCode, invite.windowDays])
  const bound = await one(setup, 'select referred_by, referred_source from profiles where id=$1', [inviter])
  await setup.query('rollback')
  // The rollback undid the binding with the switch; write it as the trigger did.
  await setup.query("update profiles set referred_by=$1,referred_source='org_l1',referred_member=$2,referred_at=now() where id=$3", [base.owner, base.staff, inviter])
  expect(bound).toEqual({ referred_by: base.owner, referred_source: 'org_l1' })
  const { code } = await one(setup, 'select get_or_create_invite_code($1) as code', [inviter])
  const invitee = await createUser(setup)
  await setup.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [invitee, 'signup:' + invitee])
  return { ...base, inviter, invitee, code: code as string }
}

it('attributes a level-2 invitee to the new owner when the redemption races the transfer', async () => {
  const { actor, orgId, staff, inviter, invitee, code } = await levelTwoOrg()
  await openTransfer(actor, orgId, staff)
  const seen = await race(
    () => racer.query("select redeem_code($1,$2,'signup',null,$3)", [invitee, code, invite.windowDays]),
    () => one(racer, 'select referred_by, referred_source, referred_via from profiles where id=$1', [invitee]),
  )
  expect(seen).toEqual({ referred_by: staff, referred_source: 'org_l2', referred_via: inviter })
})

// The transfer never waits once it holds a lock: a row another transaction holds first makes it
// fail at once with ORG_BUSY (no deadlock, nothing written), and it succeeds once that ends.
async function busyThenRetry(hold: () => Promise<unknown>, after: () => Promise<unknown>, orgId: string, actor: string, to: string) {
  const { at } = await one(setup, 'select updated_at::text as at from orgs where id=$1', [orgId])
  const input = { org_id: orgId, user_id: to, expected_updated_at: at }
  await racer.query('begin')
  await hold()
  await expect(mover.query('select admin_org_transfer_owner($1,$2)', [actor, input])).rejects.toThrow('ORG_BUSY')
  await after()
  await racer.query('commit')
  expect(await one(setup, 'select owner_user_id <> $2 as unchanged from orgs where id=$1', [orgId, to])).toEqual({ unchanged: true })
  await mover.query('select admin_org_transfer_owner($1,$2)', [actor, input])
  expect(await one(setup, 'select owner_user_id from orgs where id=$1', [orgId])).toEqual({ owner_user_id: to })
}

it('is busy, not deadlocked, against a redemption that locked a bound inviter first', async () => {
  const { actor, orgId, owner, staff, inviter, invitee } = await levelTwoOrg()
  await busyThenRetry(
    // redeem_code's order: both profiles (id order), then the attribution trigger's account lock.
    () => racer.query('select 1 from profiles where id in ($1,$2) order by id for no key update', [inviter, invitee]),
    () => racer.query('select 1 from affiliates where user_id=$1 for key share', [owner]),
    orgId, actor, staff,
  )
  expect(await one(setup, 'select referred_by from profiles where id=$1', [inviter])).toEqual({ referred_by: staff })
})

it('is busy, not deadlocked, against a refund that holds a commission of the account', async () => {
  const { actor, orgId, owner, staff, inviter } = await levelTwoOrg()
  await setup.query("insert into affiliate_adjustments(request_id,affiliate_user_id,amount,reason) values(gen_random_uuid(),$1,100,'fixture')", [owner])
  await busyThenRetry(
    // A refund holds a row that references the account (its commission; here an adjustment),
    // then wants the payer's profile (the clawback).
    () => racer.query('select 1 from affiliate_adjustments where affiliate_user_id=$1 for update', [owner]),
    () => racer.query('select 1 from profiles where id=$1 for update', [inviter]),
    orgId, actor, staff,
  )
})

it('is busy against a binding or payment still in flight on the account', async () => {
  const { actor, orgId, owner, staff } = await committedOrg()
  await busyThenRetry(
    () => racer.query('select 1 from affiliates where user_id=$1 for key share', [owner]),
    async () => undefined,
    orgId, actor, staff,
  )
})

it('waits for the org row only while holding nothing (a foreign key on the org held elsewhere)', async () => {
  const { actor, orgId, owner, staff } = await committedOrg()
  const { at } = await one(setup, 'select updated_at::text as at from orgs where id=$1', [orgId])
  await racer.query('begin')
  // Any insert with a foreign key to orgs (a generation slot, a ledger row) holds this.
  await racer.query('select 1 from orgs where id=$1 for key share', [orgId])
  const moverPid = await pidOf(mover)
  const moving = mover.query('select admin_org_transfer_owner($1,$2)', [actor, { org_id: orgId, user_id: staff, expected_updated_at: at }])
  await waitsOnLock(moverPid)
  // While it waits the transfer holds no other row: the racer locks the owner's seat and account freely.
  await racer.query('select 1 from org_members where org_id=$1 and user_id=$2 for update', [orgId, owner])
  await racer.query('select 1 from affiliates where user_id=$1 for key share', [owner])
  await racer.query('commit')
  await moving
  expect(await one(setup, 'select owner_user_id from orgs where id=$1', [orgId])).toEqual({ owner_user_id: staff })
})
