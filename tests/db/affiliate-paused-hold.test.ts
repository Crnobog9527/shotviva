import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { available, commission, dispute, promoter, refund, row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// Migration 2028: a payment made while an org's affiliate account is paused (switch off, or an
// admin suspension of the org account) is held (on_hold, paused_hold) instead of voided, released
// by the normal rules when the account is active again, and voided as affiliate_inactive when it is
// closed for good. Personal affiliates keep voiding. Each test runs in a rolled-back transaction.

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

async function orgCustomer(source = 'org_l1', referredAt = 'now()') {
  const owner = await createUser(db)
  const input = { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: true }
  const { id: orgId } = await row(db, 'select admin_org_create($1,$2) as id', [actor, input])
  const customer = await createUser(db)
  await db.query(`update profiles set referred_by=$2,referred_source=$3,referred_at=${referredAt} where id=$1`, [customer, owner, source])
  return { owner, customer, orgId: orgId as string }
}
const setOrg = (orgId: string, on: boolean) => db.query('select admin_org_update($1,$2,$3)', [actor, orgId, { affiliate_enabled: on }])
const setAccount = (user: string, input: object) => db.query('select admin_affiliate_set($1,$2)', [actor, { user_id: user, ...input }])
const held = (payment: string, level = 1) =>
  row(db, 'select amount::int,status,void_reason,paused_hold from affiliate_commissions where payment_id=$1 and level=$2', [payment, level])
const changes = async (payment: string) => (await db.query(`select h.old_status,h.new_status,h.new_amount::int,h.reason
  from affiliate_commission_changes h join affiliate_commissions c on c.id=h.commission_id
  where c.payment_id=$1 and c.level=1 order by h.id`, [payment])).rows
const pending = async (user: string) => (await row(db, 'select pending::int from affiliate_balances where affiliate_user_id=$1', [user])).pending

it('holds a sale made while the switch is off and releases it to pending when the switch is on again', async () => {
  const { owner, customer, orgId } = await orgCustomer()
  await setOrg(orgId, false)
  const p = await sale(db, customer, 'pack_m', 2490)
  expect(await held(p.id)).toEqual({ amount: 373, status: 'on_hold', void_reason: null, paused_hold: true })
  expect(await commission(db, p.id, 2)).toBeUndefined()
  expect(await changes(p.id)).toEqual([{ old_status: null, new_status: 'on_hold', new_amount: 373, reason: 'affiliate_paused' }])
  // Held, so neither pending nor available.
  expect(await pending(owner)).toBe(0)
  expect(await available(db, owner)).toBe(0)

  // Recomputing while still paused writes nothing new.
  await db.query('select affiliate_recompute_payment($1)', [p.id])
  await db.query('select admin_affiliate_recompute($1,$2)', [actor, p.id])
  expect(await changes(p.id)).toHaveLength(1)
  // The daily run never confirms it.
  await db.query("select affiliate_daily('2099-01-02')")
  expect((await held(p.id)).status).toBe('on_hold')

  await setOrg(orgId, true)
  expect(await held(p.id)).toEqual({ amount: 373, status: 'pending', void_reason: null, paused_hold: false })
  expect((await changes(p.id)).at(-1)).toEqual({ old_status: 'on_hold', new_status: 'pending', new_amount: 373, reason: 'affiliate_resumed' })
  expect(await pending(owner)).toBe(373)
  // Turning the switch off and on again does not touch a released row.
  await setOrg(orgId, false)
  await setOrg(orgId, true)
  expect(await changes(p.id)).toHaveLength(2)

  // It confirms by the normal hold_days rule.
  await db.query("select affiliate_daily('2099-01-02')")
  expect((await held(p.id)).status).toBe('confirmed')
  expect(await available(db, owner)).toBe(373)
})

it('confirms at once on release when the hold period has already passed', async () => {
  await db.query('update affiliate_settings set hold_days=0')
  const { owner, customer, orgId } = await orgCustomer()
  await setOrg(orgId, false)
  const p = await sale(db, customer, 'pack_m', 2490)
  expect((await held(p.id)).status).toBe('on_hold')
  await setOrg(orgId, true)
  expect(await held(p.id)).toMatchObject({ status: 'confirmed', paused_hold: false })
  expect(await available(db, owner)).toBe(373)
})

it('voids still-held commissions as affiliate_inactive when the paused account is banned', async () => {
  const { owner, customer, orgId } = await orgCustomer()
  await setOrg(orgId, false)
  const p = await sale(db, customer, 'pack_m', 2490)
  await setAccount(owner, { status: 'banned' })
  expect(await held(p.id)).toEqual({ amount: 0, status: 'void', void_reason: 'affiliate_inactive', paused_hold: false })
  expect((await changes(p.id)).at(-1)).toMatchObject({ old_status: 'on_hold', new_status: 'void', reason: 'affiliate_inactive' })
  // Later sales void as before, and the void is final.
  const later = await sale(db, customer, 'pack_m', 2490)
  expect(await held(later.id)).toMatchObject({ status: 'void', void_reason: 'affiliate_inactive', paused_hold: false })
  await refund(db, p.charge, 100)
  expect(await held(p.id)).toMatchObject({ status: 'void', void_reason: 'affiliate_inactive' })
})

it('an admin suspension of an org account holds too; reactivation releases it, a personal suspension still voids', async () => {
  const { owner, customer } = await orgCustomer()
  await setAccount(owner, { status: 'suspended' })
  const p = await sale(db, customer, 'pack_m', 2490)
  expect(await held(p.id)).toMatchObject({ status: 'on_hold', paused_hold: true })
  await setAccount(owner, { status: 'active' })
  expect(await held(p.id)).toMatchObject({ status: 'pending', paused_hold: false })

  const personal = await promoter(db)
  const buyer = await createUser(db)
  await db.query("update profiles set referred_by=$2,referred_source='signup',referred_at=now() where id=$1", [buyer, personal.id])
  await db.query("update affiliates set status='suspended' where user_id=$1", [personal.id])
  const q = await sale(db, buyer, 'pack_m', 2490)
  expect(await held(q.id)).toEqual({ amount: 0, status: 'void', void_reason: 'affiliate_inactive', paused_hold: false })
  await db.query("update affiliates set status='active' where user_id=$1", [personal.id])
  expect(await held(q.id)).toMatchObject({ status: 'void', void_reason: 'affiliate_inactive' })
})

it('refunds and disputes during the pause change the held amount; a voided row stays void on release', async () => {
  const { customer, orgId } = await orgCustomer()
  await setOrg(orgId, false)
  const partial = await sale(db, customer, 'pack_m', 2490)
  await refund(db, partial.charge, 1245)
  expect(await held(partial.id)).toEqual({ amount: 186, status: 'on_hold', void_reason: null, paused_hold: true })
  expect((await changes(partial.id)).at(-1)).toMatchObject({ new_amount: 186, reason: 'partial_refund' })

  const full = await sale(db, customer, 'pack_m', 2490)
  await refund(db, full.charge, 2490)
  expect(await held(full.id)).toEqual({ amount: 0, status: 'void', void_reason: 'refunded', paused_hold: false })

  const won = await sale(db, customer, 'pack_m', 2490)
  const before = (await changes(won.id)).length
  const d = await dispute(db, won.charge, 2490)
  // Already on hold: the open dispute changes nothing, so no change row.
  expect(await held(won.id)).toMatchObject({ amount: 373, status: 'on_hold', paused_hold: true })
  expect(await changes(won.id)).toHaveLength(before)
  await db.query("select close_payment_dispute($1,'won')", [d])
  expect(await held(won.id)).toMatchObject({ amount: 373, status: 'on_hold', paused_hold: true })

  const lost = await sale(db, customer, 'pack_m', 2490)
  const l = await dispute(db, lost.charge, 2490)
  await db.query("select close_payment_dispute($1,'lost')", [l])
  expect(await held(lost.id)).toEqual({ amount: 0, status: 'void', void_reason: 'dispute_lost', paused_hold: false })

  const fullChanges = (await changes(full.id)).length
  await setOrg(orgId, true)
  expect(await held(partial.id)).toMatchObject({ amount: 186, status: 'pending', paused_hold: false })
  expect(await held(won.id)).toMatchObject({ amount: 373, status: 'pending', paused_hold: false })
  expect(await held(full.id)).toMatchObject({ status: 'void', void_reason: 'refunded' })
  expect(await changes(full.id)).toHaveLength(fullChanges)
  expect(await held(lost.id)).toMatchObject({ status: 'void', void_reason: 'dispute_lost' })
})

it('a dispute still open at release keeps the row on hold until it is won', async () => {
  const { customer, orgId } = await orgCustomer()
  await setOrg(orgId, false)
  const p = await sale(db, customer, 'pack_m', 2490)
  const d = await dispute(db, p.charge, 2490)
  await setOrg(orgId, true)
  expect(await held(p.id)).toMatchObject({ status: 'on_hold', paused_hold: false })
  await db.query("select close_payment_dispute($1,'won')", [d])
  expect(await held(p.id)).toMatchObject({ status: 'pending', paused_hold: false })
})

it('keeps the pause hold apart from the same_ip release: neither releases the other', async () => {
  // A personal-era customer of the org row keeps the same_ip flag (2022).
  const { owner, customer, orgId } = await orgCustomer('signup', "now()-interval '1 day'")
  await db.query("update affiliates set approved_at=now() where user_id=$1", [owner])
  await db.query("update profiles set signup_ip='203.0.113.77' where id=any($1::uuid[])", [[owner, customer]])
  await setOrg(orgId, false)
  const flagged = await sale(db, customer, 'pack_m', 2490)
  expect(await commission(db, flagged.id)).toMatchObject({ status: 'on_hold', flags: ['same_ip'] })
  const plain = await row(db, 'select id from affiliate_commissions where payment_id=$1', [flagged.id])

  // Releasing the flag leaves the pause hold.
  await db.query('select admin_affiliate_commission_release($1,$2)', [actor, { commission_id: plain.id, decision: 'release', reason: 'checked' }])
  expect(await held(flagged.id)).toMatchObject({ status: 'on_hold', paused_hold: true })
  // A row held only by the pause cannot be "released" by an admin.
  await db.query("update profiles set signup_ip=null where id=$1", [customer])
  const paused = await sale(db, customer, 'pack_m', 2490)
  const pausedRow = await row(db, 'select id from affiliate_commissions where payment_id=$1', [paused.id])
  await db.query('savepoint refused')
  await expect(db.query('select admin_affiliate_commission_release($1,$2)', [actor, { commission_id: pausedRow.id, decision: 'release', reason: 'x' }]))
    .rejects.toThrow('AFFILIATE_NOT_FLAGGED')
  await db.query('rollback to savepoint refused')

  // Resuming does not release an unreleased same_ip flag.
  const third = await sale(db, customer, 'pack_m', 2490)
  await db.query("update affiliate_commissions set flags='{same_ip}' where payment_id=$1", [third.id])
  await setOrg(orgId, true)
  expect(await held(flagged.id)).toMatchObject({ status: 'pending', paused_hold: false })
  expect(await held(paused.id)).toMatchObject({ status: 'pending', paused_hold: false })
  expect(await held(third.id)).toMatchObject({ status: 'on_hold', paused_hold: false })
  expect((await changes(third.id)).at(-1)).toMatchObject({ new_status: 'on_hold', reason: 'affiliate_resumed' })
})

it('an admin void while held is final and the release adds no change row', async () => {
  const { customer, orgId } = await orgCustomer()
  await setOrg(orgId, false)
  const p = await sale(db, customer, 'pack_m', 2490)
  const c = await row(db, 'select id from affiliate_commissions where payment_id=$1', [p.id])
  await db.query('select admin_affiliate_commission_release($1,$2)', [actor, { commission_id: c.id, decision: 'void', reason: 'fraud' }])
  const n = (await changes(p.id)).length
  await setOrg(orgId, true)
  expect(await held(p.id)).toEqual({ amount: 0, status: 'void', void_reason: 'admin_void', paused_hold: false })
  expect(await changes(p.id)).toHaveLength(n)
})
