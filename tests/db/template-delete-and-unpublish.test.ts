import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { connectAdmin, createUser, publishFixture } from './helpers'
import { serviceSupabase } from './supabase-env'

// 1400: a member that goes from 上架 to 下架 leaves its series. 1401: 删除 is a soft delete of an
// unpublished template that keeps the row (and so every job pointing at it) and can never go live
// again. 1402: the template order groups ignore deleted rows.

const category = 'qa-delete-unpublish'
const ids = ['qa-del-a', 'qa-del-b', 'qa-del-c']
const service = serviceSupabase()
let pg: Client
let admin: string
let member: string
let series: string

const row = async (id: string) =>
  (await pg.query('select is_active,series_id,series_sort_order,featured_rank,deleted_at from public.templates where id=$1', [id])).rows[0]
const remove = (id: string, actor = admin) => service.rpc('admin_delete_template', { p_actor: actor, p_id: id })

beforeAll(async () => {
  pg = await connectAdmin()
  admin = await createUser(pg)
  member = await createUser(pg)
  await pg.query("update public.profiles set role='admin' where id=$1", [admin])
  await pg.query('insert into public.template_categories(key,name_en,name_zh) values($1,$1,$1)', [category])
  await pg.query(`insert into public.templates(id,name,category_key,fields,cover_after_url,is_active)
    select id,id,$2,'{"images":{"min":1,"max":1},"copy":[],"aspectRatios":["1:1"]}','https://example.test/m.webp',false
    from unnest($1::text[]) id`, [ids, category])
  const { rows } = await pg.query(`insert into public.template_series(slug,name_en,name_zh,category_key,is_active)
    values ('qa-del-series','S','S',$1,true) returning id`, [category])
  series = rows[0].id
})

afterAll(async () => {
  await pg.query('delete from public.admin_audit_log where target_id=any($1)', [ids])
  await pg.query('delete from public.templates where category_key=$1', [category])
  await pg.query('delete from public.template_series where category_key=$1', [category])
  await pg.query('delete from public.template_categories where key=$1', [category])
  await pg.query('delete from auth.users where id=any($1)', [[admin, member]])
  await pg.end()
})

it('takes a member out of its series when it is unpublished, but lets a draft join one', async () => {
  const [a, b] = ids
  await pg.query('update public.templates set series_id=$1, series_sort_order=1 where id=any($2)', [series, [a, b]])
  expect(await row(b)).toMatchObject({ is_active: false, series_id: series })
  await publishFixture(pg, a)
  expect(await row(a)).toMatchObject({ is_active: true, series_id: series })
  await pg.query('update public.templates set is_active=false where id=$1', [a])
  expect(await row(a)).toMatchObject({ is_active: false, series_id: null, series_sort_order: 0 })
  expect((await row(b)).series_id).toBe(series)
  await pg.query('update public.templates set series_id=null where id=$1', [b])
})

it('soft-deletes an unpublished template once, audited, and refuses live, built-in or non-admin calls', async () => {
  const [a, , c] = ids
  await publishFixture(pg, c)
  expect((await remove(c)).error?.message).toBe('TEMPLATE_LIVE')
  expect((await remove('freeform')).error?.message).toBe('TEMPLATE_BUILT_IN')
  expect((await remove('qa-del-missing')).error?.message).toBe('TEMPLATE_MISSING')
  expect((await remove(a, member)).error?.message).toBe('NOT_ADMIN')
  expect(await remove(a)).toMatchObject({ data: true, error: null })
  expect(await remove(a)).toMatchObject({ data: false, error: null })
  expect((await row(a)).deleted_at).not.toBeNull()
  const audits = await pg.query('select action,user_id from public.admin_audit_log where target_id=$1', [a])
  expect(audits.rows).toEqual([{ action: 'template_delete', user_id: admin }])
})

it('keeps a deleted template unpublished, out of series and featuring, and not restorable', async () => {
  const [a] = ids
  for (const change of ['is_active=true', `series_id='${series}'`, 'featured_rank=1', 'deleted_at=null']) {
    await expect(pg.query(`update public.templates set ${change} where id=$1`, [a])).rejects.toThrow('TEMPLATE_DELETED')
  }
  const candidates = await service.rpc('admin_series_candidates', { p_search: 'qa-del-', p_after: null })
  expect((candidates.data as { id: string }[]).map(t => t.id)).not.toContain(a)
  const count = await pg.query('select public.admin_assigned_template_count(c) n from public.template_categories c where key=$1', [category])
  expect(Number(count.rows[0].n)).toBe(ids.length - 1)
})

it('orders the 已下架 group without the deleted rows', async () => {
  const { rows } = await pg.query(`select id from public.templates
    where not is_active and id<>'edit' and deleted_at is null order by sort_order, id`)
  const group = rows.map(r => r.id as string)
  expect(group).not.toContain(ids[0])
  const result = await service.rpc('admin_set_template_order', {
    p_group: 'inactive', p_ids: group, p_actor: admin, p_expected_ids: group,
  })
  expect(result.error).toBeNull()
})
