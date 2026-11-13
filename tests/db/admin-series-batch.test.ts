import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { anonClient, connectAdmin, createUser, serviceClient } from './helpers'

// 1296: 系列管理's whole-list reorder and batch flags. Calls go through PostgREST with the service
// role key, as the admin server actions do.

let db: Awaited<ReturnType<typeof connectAdmin>>
let admin: string
let member: string
let categoryKey: string
const created: string[] = []

async function series(active = false) {
  const slug = 'qa-batch-' + randomUUID().slice(0, 8)
  const { rows } = await db.query(`insert into public.template_series(slug,name_en,name_zh,category_key,sort_order,is_active)
    values ($1,$1,$1,$2,9999,$3) returning id`, [slug, categoryKey, active])
  created.push(rows[0].id)
  return rows[0].id as string
}
const flags = async (ids: string[]) =>
  (await db.query('select id,is_active,show_members from public.template_series where id=any($1::uuid[]) order by id', [ids])).rows
const audits = async (ids: string[]) =>
  (await db.query('select action,user_id,target_id,reason from public.admin_audit_log where target_id=any($1::text[]) order by id', [ids])).rows
const setFlag = (args: { ids: readonly string[]; field: string; value: boolean; reason?: string | null; actor?: string }) =>
  serviceClient().rpc('admin_set_template_series_flag', {
    p_actor: args.actor ?? admin, p_ids: [...args.ids], p_field: args.field, p_value: args.value, p_reason: args.reason ?? null,
  })

beforeAll(async () => {
  db = await connectAdmin()
  admin = await createUser(db)
  member = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [admin])
  const { rows } = await db.query('select key from public.template_categories where not is_system order by key limit 1')
  categoryKey = rows[0].key
})
afterAll(async () => {
  await db.query('delete from public.admin_audit_log where target_id=any($1::text[])', [created])
  await db.query('delete from public.template_series where id=any($1::uuid[])', [created])
  await db.end()
})

it('saves the whole list order in one call and refuses a list that changed since it was read', async () => {
  await series()
  await series()
  const { rows } = await db.query('select id,sort_order from public.template_series order by sort_order,id')
  const reversed = rows.map(r => r.id as string).reverse()
  try {
    const result = await serviceClient().rpc('admin_reorder_template_series', { p_actor: admin, p_ids: reversed })
    expect(result.error).toBeNull()
    expect((await db.query('select id from public.template_series order by sort_order,id')).rows.map(r => r.id)).toEqual(reversed)
    expect((await db.query('select sort_order from public.template_series where id=$1', [reversed[1]])).rows[0].sort_order).toBe(20)
    for (const stale of [reversed.slice(1), [...reversed, randomUUID()], [reversed[0], ...reversed.slice(0, -1)]]) {
      expect((await serviceClient().rpc('admin_reorder_template_series', { p_actor: admin, p_ids: stale })).error?.message).toBe('SERIES_CHANGED')
    }
    expect((await serviceClient().rpc('admin_reorder_template_series', { p_actor: member, p_ids: reversed })).error?.message).toBe('NOT_ADMIN')
  } finally {
    for (const r of rows) await db.query('update public.template_series set sort_order=$2 where id=$1', [r.id, r.sort_order])
  }
})

it('publishes several series in one transaction with an audit row for each one that changed', async () => {
  const [a, b] = [await series(), await series(true)]
  expect(await setFlag({ ids: [a, b], field: 'is_active', value: true })).toEqual(expect.objectContaining({ data: 1, error: null }))
  expect((await flags([a, b])).every(r => r.is_active)).toBe(true)
  expect(await audits([a, b])).toEqual([{ action: 'series_set_active', user_id: admin, target_id: a, reason: '系列管理批量上架：无备注' }])
})

it('needs a reason to unpublish and records it', async () => {
  const [a, b] = [await series(true), await series(true)]
  for (const reason of [null, '  ']) {
    expect((await setFlag({ ids: [a, b], field: 'is_active', value: false, reason })).error?.message).toBe('SERIES_REASON_REQUIRED')
  }
  expect((await setFlag({ ids: [a, b], field: 'is_active', value: false, reason: '季节下线' })).data).toBe(2)
  expect((await flags([a, b])).every(r => !r.is_active)).toBe(true)
  expect((await audits([a, b])).map(r => r.reason)).toEqual(['系列管理批量下架：季节下线', '系列管理批量下架：季节下线'])
})

it('switches 成员单独展示 for all of them, and leaves everything as it was on any refusal', async () => {
  const [a, b] = [await series(), await series()]
  expect((await setFlag({ ids: [a, b], field: 'show_members', value: true })).data).toBe(2)
  expect((await flags([a, b])).map(r => r.show_members)).toEqual([true, true])
  expect((await audits([a, b])).map(r => r.action)).toEqual(['series_set_show_members', 'series_set_show_members'])
  const before = await flags([a, b])
  for (const [args, reason] of [
    [{ ids: [a, randomUUID()], field: 'show_members', value: false }, 'SERIES_CHANGED'],
    [{ ids: [a, a], field: 'show_members', value: false }, 'INVALID_INPUT'],
    [{ ids: [a], field: 'slug', value: false }, 'INVALID_INPUT'],
    [{ ids: [a], field: 'show_members', value: false, actor: member }, 'NOT_ADMIN'],
  ] as const) expect((await setFlag(args)).error?.message).toBe(reason)
  expect(await flags([a, b])).toEqual(before)
})

it('is callable by the service role only', async () => {
  const a = await series()
  expect((await anonClient().rpc('admin_set_template_series_flag', { p_actor: admin, p_ids: [a], p_field: 'show_members', p_value: true, p_reason: null })).error).not.toBeNull()
  expect((await anonClient().rpc('admin_reorder_template_series', { p_actor: admin, p_ids: [a] })).error).not.toBeNull()
  for (const role of ['anon', 'authenticated']) {
    const { rows } = await db.query(`select has_function_privilege($1,'public.admin_set_template_series_flag(uuid,uuid[],text,boolean,text)','EXECUTE') f,
      has_function_privilege($1,'public.admin_reorder_template_series(uuid,uuid[])','EXECUTE') r`, [role])
    expect(rows[0]).toEqual({ f: false, r: false })
  }
})
