import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'
import { transferKit } from './org-transfer-fixtures'

// admin_org_transfer_owner (1930): commission retry snapshots after a transfer. Each test runs in
// a transaction that is rolled back.

let db: Client
let actor: string
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  await db.query('update affiliate_settings set enabled=true')
  actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const { createOrg, joinOrg, transfer, invitedBy, channelOrg } = transferKit(() => db, () => actor)

// Every state in which a stored retry snapshot (affiliate_recompute_errors) can name the old
// owner, and where its commission must land (1930 header, cases 1-5).
describe('retry snapshots that name the old owner', () => {
  // A payment whose commission write failed and waits for a retry. Raw SQL only builds that state.
  async function failedSale(customer: string) {
    const paid = await sale(db, customer, 'pack_m', 2490)
    const snap = (await row(db, 'select public._affiliate_snapshot(p) s from payments p where p.id=$1', [paid.id])).s
    await db.query('delete from affiliate_commission_changes where commission_id in (select id from affiliate_commissions where payment_id=$1)', [paid.id])
    await db.query('delete from affiliate_commissions where payment_id=$1', [paid.id])
    return { id: paid.id as string, snap: snap as Record<string, unknown> }
  }
  const store = (id: string, snap: object) =>
    db.query("insert into affiliate_recompute_errors(payment_id,error,snapshot) values($1,'23503: fixture',$2)", [id, snap])
  async function retried(id: string) {
    await db.query('select affiliate_recompute_payment($1)', [id])
    expect(await row(db, 'select count(*)::int n from affiliate_recompute_errors where payment_id=$1 and resolved_at is null', [id])).toEqual({ n: 0 })
    return (await row(db, 'select affiliate_user_id from affiliate_commissions where payment_id=$1 and level=1', [id]))?.affiliate_user_id
  }
  // The former owner leaves and opens a personal affiliate account under the same user id.
  async function personalAccount(newOwner: string, former: string) {
    await db.query("select org_remove_member($1,$2,$3)", [newOwner, former, 'rm:' + former])
    const slug = 'qa-' + former.slice(0, 12)
    await db.query("insert into affiliates(user_id,slug,status) values($1,$2,'active')", [former, slug])
    return slug
  }

  it('carries the account\'s org in every new snapshot (null for a personal account)', async () => {
    const { orgId, customer } = await channelOrg()
    expect((await failedSale(customer)).snap.org).toBe(orgId)
    const personal = await createUser(db)
    await db.query("insert into affiliates(user_id,slug,status) values($1,$2,'active')", [personal, 'qa-' + personal.slice(0, 12)])
    const buyer = await createUser(db)
    await db.query('select affiliate_bind($1,$2,$3)', [buyer, 'qa-' + personal.slice(0, 12), 'signup'])
    expect((await failedSale(buyer)).snap).toMatchObject({ owner: personal, org: null })
  })

  it('case 2: errors stored before the transfer, with and without the org key, go to the new owner', async () => {
    const { owner, orgId, staff, customer } = await channelOrg()
    const withOrg = await failedSale(customer)
    const legacy = await failedSale(customer)
    await store(withOrg.id, withOrg.snap)
    const old = { ...legacy.snap }
    delete old.org
    await store(legacy.id, old)
    await transfer(orgId, staff)
    expect((await row(db, "select snapshot->>'owner' o from affiliate_recompute_errors where payment_id=$1", [legacy.id])).o).toBe(staff)
    await personalAccount(staff, owner)
    expect(await retried(withOrg.id)).toBe(staff)
    expect(await retried(legacy.id)).toBe(staff)
  })

  it('case 3: a payment racing the transfer is booked to the org, even after a personal account or a rebind', async () => {
    const { owner, orgId, staff, customer } = await channelOrg()
    const raced = await failedSale(customer)
    const rebound = await failedSale(customer)
    await transfer(orgId, staff)
    // Stored after the commit with the snapshot read before it.
    await store(raced.id, raced.snap)
    await store(rebound.id, rebound.snap)
    await personalAccount(staff, owner)
    expect(await retried(raced.id)).toBe(staff)
    await db.query('update profiles set referred_by=null,referred_source=null where id=$1', [customer])
    expect(await retried(rebound.id)).toBe(staff)
  })

  it('case 4: a failed payment of the former owner\'s later personal account stays personal', async () => {
    const { owner, orgId, staff } = await channelOrg()
    await transfer(orgId, staff)
    const slug = await personalAccount(staff, owner)
    const buyer = await createUser(db)
    await db.query('select affiliate_bind($1,$2,$3)', [buyer, slug, 'signup'])
    const paid = await failedSale(buyer)
    expect(paid.snap).toMatchObject({ owner, org: null })
    await store(paid.id, paid.snap)
    expect(await retried(paid.id)).toBe(owner)
  })

  it('case 5: the org moving again or back, and the former owner owning another org, each keep their own', async () => {
    const { owner, orgId, staff, customer } = await channelOrg()
    const third = await createUser(db)
    await joinOrg(third, orgId)
    const early = await failedSale(customer)
    await transfer(orgId, staff)
    await store(early.id, early.snap)
    await transfer(orgId, third)
    expect(await retried(early.id)).toBe(third)
    const back = await failedSale(customer)
    await store(back.id, back.snap)
    await transfer(orgId, owner)
    expect(await retried(back.id)).toBe(owner)
    // staff (twice a former owner) now leaves and creates their own org with an account.
    await db.query("select org_remove_member($1,$2,'rm:staff')", [owner, staff])
    const otherOrg = await createOrg(staff)
    const theirs = await invitedBy(staff)
    const own = await failedSale(theirs)
    expect(own.snap).toMatchObject({ owner: staff, org: otherOrg })
    await store(own.id, own.snap)
    expect(await retried(own.id)).toBe(staff)
  })
})
