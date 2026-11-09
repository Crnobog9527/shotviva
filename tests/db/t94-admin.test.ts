import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { anonClient, connectAdmin, createUser, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'

const service = serviceClient()
const codeName = () => randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()
let db: Client
let actor: string
let other: string

beforeAll(async () => {
  db = await connectAdmin()
  actor = await createUser(db)
  other = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [actor])
})
afterAll(async () => { await db.end() })

const save = (id: string, fields: Record<string, unknown>, by = actor) =>
  service.rpc('admin_save_code', { p_actor: by, p_code_id: id, p_fields: fields })

function discount(products: string[], percent: number) {
  return { code: codeName(), stripe_coupon_id: codeName(), discount_percent: percent, discount_duration: 'once', discount_products: products }
}

describe('admin campaign writes', () => {
  it('saves a 20% monthly campaign, refuses all edits to discount terms and audits successful writes', async () => {
    const id = randomUUID()
    const fields = discount(['starter_monthly', 'pro_monthly', 'max_monthly'], 20)
    expect(await save(id, { ...fields, code: fields.code.toLowerCase() })).toMatchObject({ data: id, error: null })
    expect(await save(id, { discount_percent: 21 })).toMatchObject({ error: { message: 'CODE_DISCOUNT_IMMUTABLE' } })
    expect(await save(id, { discount_products: ['pro_monthly'] })).toMatchObject({ error: { message: 'CODE_DISCOUNT_IMMUTABLE' } })
    expect(await save(id, { stripe_coupon_id: 'another' })).toMatchObject({ error: { message: 'CODE_DISCOUNT_IMMUTABLE' } })
    expect(await save(id, { note: '延长活动', expires_at: '2099-10-01' })).toMatchObject({ data: id })
    expect(await serviceSupabase().rpc('admin_set_code_active', { p_actor: actor, p_code_id: id, p_active: false })).toMatchObject({ error: null })
    const stored = await db.query('select code, note, active from public.codes where id=$1', [id])
    expect(stored.rows).toEqual([{ code: fields.code, note: '延长活动', active: false }])
    const log = await db.query('select action, user_id from public.admin_audit_log where target_id=$1 order by id', [id])
    expect(log.rows).toEqual(['save_code', 'save_code', 'set_code_active'].map(action => ({ action, user_id: actor })))
  })

  it('reports every failing annual product and enforces the unrounded boundary', async () => {
    const id = randomUUID()
    await expect(db.query('select public.admin_save_code($1,$2,$3)', [actor, id,
      discount(['starter_yearly', 'pro_yearly', 'max_yearly'], 30)])).rejects.toMatchObject({
      message: 'CODE_DISCOUNT_PRODUCTS', detail: '["max_yearly","pro_yearly"]',
    })
    expect(await save(id, discount(['max_yearly'], 2))).toMatchObject({ error: { message: 'CODE_DISCOUNT_PRODUCTS' } })
    expect(await save(id, discount(['max_yearly'], 1))).toMatchObject({ data: id, error: null })
  })

  it('requires a cap on paid gifts and an admin for all administrative calls', async () => {
    const id = randomUUID()
    const fields = { code: codeName(), invitee_credits: 50, invitee_pool: 'paid' }
    expect((await save(id, fields)).error).toBeTruthy()
    expect(await save(id, { ...fields, max_redemptions: 1 }, other)).toMatchObject({ error: { message: 'NOT_ADMIN' } })
    expect(await save(id, { ...fields, max_redemptions: 1 })).toMatchObject({ data: id })
    const cases = [
      ['admin_set_code_active', { p_code_id: id, p_active: false }],
      ['admin_list_codes', {}], ['admin_code_redemptions', {}], ['admin_top_inviters', {}],
    ] as const
    for (const [name, args] of cases) {
      const call = { p_actor: other, ...args }
      expect(await service.rpc(name, call)).toMatchObject({ error: { message: 'NOT_ADMIN' } })
      expect((await anonClient().rpc(name, { ...call, p_actor: actor })).error).toBeTruthy()
    }
  })
})

async function payment(userId: string, codeId: string | null, conflict: boolean, currency = 'usd') {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.payments(user_id, code_id, code_discount_conflict, product_id, channel, currency, method,
      amount_total, amount_tax, amount_refunded, amount_discount, stripe_session_id)
     values($1,$2,$3,'pack_s','stripe',$4,'card',200,20,50,40,$5) returning id`,
    [userId, codeId, conflict, currency, `cs_${randomUUID()}`],
  )
  return Number(rows[0]!.id)
}

async function redemption(id: string, user: string, inviter: string | null, status = 'ok') {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.code_redemptions(code_id,user_id,inviter_user_id,kind,status,context)
     values($1,$2,$3,case when $3::uuid is null then 'campaign' else 'invite' end,$4,'account') returning id`,
    [id, user, inviter, status],
  )
  return rows[0]!.id
}

describe('admin code reports', () => {
  it('counts each attributed payment once, groups currencies and shows the late discounted payment', async () => {
    const id = randomUUID()
    expect(await save(id, discount(['pack_s'], 10))).toMatchObject({ data: id })
    const buyer = await createUser(db)
    await redemption(id, buyer, null)
    await payment(buyer, id, false)
    const duplicate = await payment(buyer, id, true)
    await payment(buyer, id, false, 'cny')
    await payment(buyer, null, false)
    const result = await service.rpc('admin_list_codes', { p_actor: actor, p_code_id: id })
    expect(result).toMatchObject({ data: [{ purchasers: 1, amounts: {
      usd: { net: 260, discount: 80 }, cny: { net: 130, discount: 40 },
    } }], error: null })
    const detail = await service.rpc('admin_code_redemptions', { p_actor: actor, p_code_id: id })
    expect(detail).toMatchObject({ data: [{ discount_conflict_payments: [duplicate] }], error: null })
  })

  it('counts a buyer even without a reward and excludes blocked invites from private stats', async () => {
    const inviter = await createUser(db)
    const buyer = await createUser(db)
    const blocked = await createUser(db)
    const summary = () => service.rpc('my_invite_summary', { p_user: inviter, p_inviter_cap: 20 })
    expect(await summary()).toMatchObject({ data: { invited: 0, purchasers: 0, rewards_left: 20 } })
    const { rows } = await db.query('select id from public.codes where owner_user_id=$1', [inviter])
    await redemption(rows[0].id, buyer, inviter)
    const blockedId = await redemption(rows[0].id, blocked, inviter, 'blocked_same_ip')
    await payment(buyer, null, false)
    expect(await summary()).toMatchObject({ data: { invited: 1, purchasers: 1, earned: 0, rewards_left: 20, friends: [{ purchased: true }] } })
    const ranking = await service.rpc('admin_top_inviters', { p_actor: actor, p_days: null })
    expect(ranking.data).toEqual(expect.arrayContaining([expect.objectContaining({ inviter_user_id: inviter, invited: 1, purchasers: 1 })]))
    const rejected = await service.rpc('admin_code_redemptions', { p_actor: actor })
    expect(rejected.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: blockedId, status: 'blocked_same_ip' })]))
  })

  it('uses created_at and id to page 31 redemptions with the same timestamp', async () => {
    const id = randomUUID()
    expect(await save(id, { code: codeName(), invitee_credits: 1 })).toMatchObject({ data: id })
    const ids = []
    for (let i = 0; i < 31; i++) ids.push(await redemption(id, await createUser(db), null))
    await db.query('update public.code_redemptions set created_at=$1 where code_id=$2', ['2026-01-01', id])
    const args = { p_actor: actor, p_code_id: id }
    const first = await service.rpc('admin_code_redemptions', args)
    expect(first.data).toHaveLength(30)
    const cursor = { created_at: '2026-01-01T00:00:00Z', id: ids.sort().reverse()[29] }
    const rest = await service.rpc('admin_code_redemptions', { ...args, p_cursor: cursor })
    expect(rest.data).toMatchObject([{ id: ids[30] }])
  })
})
