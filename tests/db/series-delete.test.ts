import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { connectAdmin, createUser, publishFixture } from './helpers'

// 删除已下架的系列 (Owner 2026-11-14, migrations 1500–1502): a soft delete of an unpublished series
// that moves its members out and never touches the templates themselves; the admin functions treat
// a deleted series as gone; the T93 sync carries a test-site delete to production and never brings
// a deleted series back. Each test runs in a transaction rolled back after.
let db: Client
let admin: string
const run = '1500'
const fields = { images: { min: 1, max: 1 }, aspectRatios: ['1:1'], copy: [] }

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  admin = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [admin])
})
afterEach(async () => { await db.query('rollback'); await db.end() })

async function template() {
  const id = `series-del-${randomUUID()}`
  await db.query(`insert into public.templates(id,name,category,fields,credits_cost,is_active,visible_in,cover_after_url)
    values($1,$1,'pets',$2,'{"1k":120,"2k":120,"3k":120}',false,'{web}','https://example.test/a.webp')`, [id, fields])
  await db.query("insert into public.template_prompts(template_id,body) values($1,'fixture')", [id])
  return id
}
async function series(members: string[] = [], active = false) {
  const slug = `series-del-${randomUUID().slice(0, 8)}`
  const { rows } = await db.query(`insert into public.template_series(slug,name_en,name_zh,category_key)
    values($1,'Set','套系','pets') returning id`, [slug])
  const id = rows[0].id as string
  for (const [i, member] of members.entries()) {
    await db.query('update public.templates set series_id=$1, series_sort_order=$2 where id=$3', [id, i + 1, member])
  }
  if (active) await db.query('update public.template_series set is_active=true where id=$1', [id])
  return { id, slug }
}
// As PostgREST calls it: under the service_role role, with that role's grants. A refusal rolls
// back to before the call, the role included.
async function asService(sql: string, params: unknown[]) {
  await db.query('savepoint service_call')
  try {
    await db.query('set local role service_role')
    const result = await db.query(sql, params)
    await db.query('reset role')
    await db.query('release savepoint service_call')
    return result.rows[0]?.r
  } catch (error) {
    await db.query('rollback to savepoint service_call')
    throw error
  }
}
async function refused(work: () => Promise<unknown>) {
  try {
    await work()
    return null
  } catch (error) {
    return (error as Error).message
  }
}
// A statement run as postgres that must fail, without aborting the test's transaction.
async function refusedSql(sql: string, params: unknown[]) {
  await db.query('savepoint direct')
  const message = await refused(() => db.query(sql, params))
  await db.query(message ? 'rollback to savepoint direct' : 'release savepoint direct')
  return message
}
const remove = (id: string, actor = admin) => asService('select public.admin_delete_template_series($1,$2) as r', [actor, id])
const seriesRow = async (id: string) =>
  (await db.query('select is_active, deleted_at from public.template_series where id=$1', [id])).rows[0]
const templateRow = async (id: string) => (await db.query(
  'select is_active, series_id, series_sort_order, category_key, deleted_at from public.templates where id=$1', [id])).rows[0]
const audit = async (target: string) => (await db.query(
  'select action, user_id, reason from public.admin_audit_log where target_id=$1 order by id', [target])).rows

describe('admin_delete_template_series', () => {
  it('deletes an unpublished series once, audited, moving its members out without touching them', async () => {
    const [live, draft] = [await template(), await template()]
    await publishFixture(db, live)
    const s = await series([live, draft])
    const before = await templateRow(live)
    expect(await remove(s.id)).toBe(2)
    expect((await seriesRow(s.id)).deleted_at).not.toBeNull()
    expect(await templateRow(live)).toMatchObject({ is_active: true, series_id: null, series_sort_order: 0, category_key: before.category_key, deleted_at: null })
    expect(await templateRow(draft)).toMatchObject({ is_active: false, series_id: null, deleted_at: null })
    expect(await remove(s.id)).toBeNull()
    expect(await audit(s.id)).toEqual([{ action: 'series_delete', user_id: admin, reason: `系列管理删除已下架系列 ${s.slug}，移出 2 个模板` }])
  })

  it('refuses a published series, a missing one, a non-admin and a client role', async () => {
    const live = await series([], true)
    const member = await createUser(db)
    expect(await refused(() => remove(live.id))).toBe('SERIES_LIVE')
    expect(await refused(() => remove(randomUUID()))).toBe('SERIES_MISSING')
    expect(await refused(() => remove(live.id, member))).toBe('NOT_ADMIN')
    await db.query('savepoint anon')
    await db.query('set local role authenticated')
    expect(await refused(() => db.query('select public.admin_delete_template_series($1,$2)', [admin, live.id]))).toMatch(/permission denied/)
    await db.query('rollback to savepoint anon')
    expect((await seriesRow(live.id)).deleted_at).toBeNull()
  })

  it('keeps a deleted series unpublished, empty and not restorable, on every path', async () => {
    const t = await template()
    const s = await series()
    await remove(s.id)
    for (const change of ['is_active=true', 'deleted_at=null']) {
      expect(await refusedSql(`update public.template_series set ${change} where id=$1`, [s.id])).toBe('SERIES_DELETED')
    }
    expect(await refusedSql('update public.templates set series_id=$1 where id=$2', [s.id, t])).toBe('SERIES_DELETED')
    expect(await refusedSql(`insert into public.templates(id,name,category,fields,series_id)
      values('series-del-insert','x','pets',$1,$2)`, [fields, s.id])).toBe('SERIES_DELETED')
  })
})

describe('admin functions skip deleted series', () => {
  it('orders, flags, opens and saves only series that are not deleted', async () => {
    const kept = await series()
    const gone = await series()
    await remove(gone.id)
    const order = (await db.query('select id from public.template_series where deleted_at is null order by sort_order, id')).rows.map(r => r.id)
    expect(await refused(() => asService('select public.admin_reorder_template_series($1,$2) as r', [admin, [...order, gone.id]]))).toBe('SERIES_CHANGED')
    expect(await refused(() => asService('select public.admin_reorder_template_series($1,$2) as r', [admin, [...order].reverse()]))).toBeNull()
    expect(await refused(() => asService("select public.admin_set_template_series_flag($1,$2,'show_members',true,null) as r", [admin, [gone.id]]))).toBe('SERIES_CHANGED')
    expect(await asService("select public.admin_set_template_series_flag($1,$2,'show_members',true,null) as r", [admin, [kept.id]])).toBe(1)
    expect(await asService('select public.admin_template_series_detail($1) as r', [gone.id])).toBeNull()
    const detail = await asService('select public.admin_template_series_detail($1) as r', [kept.id])
    expect(detail.slug).toBe(kept.slug)
    const fieldsOf = { slug: gone.slug, name_en: 'Set', name_zh: '套系', category_key: 'pets', sort_order: 0, is_active: false, show_members: false }
    const save = (id: string, revision: string | null) => asService('select public.admin_save_template_series($1,$2,$3,$4,$5,null) as r',
      [id, revision, fieldsOf, [], admin])
    const goneRevision = (await db.query('select admin.template_series_revision(s) r from public.template_series s where id=$1', [gone.id])).rows[0].r
    expect(await refused(() => save(gone.id, goneRevision))).toBe('SERIES_CHANGED')
    // A new series cannot take a deleted one's slug.
    expect(await refused(() => asService('select public.admin_save_template_series(null,null,$1,$2,$3,null) as r', [fieldsOf, [], admin])))
      .toMatch(/template_series_slug_key/)
  })
})

describe('T93 sync of a deleted series', () => {
  const source = (slug: string) => asService('select public.read_template_series_sync_source($1) as r', [slug])
  const syncDelete = (slug: string, validate = false) =>
    asService('select public.sync_preview_series_delete($1,$2,$3,$4) as r', [admin, slug, run, validate])

  it('tells the source read whether the series is deleted, outside the definition', async () => {
    const s = await series()
    expect((await source(s.slug)).deleted).toBe(false)
    await remove(s.id)
    const read = await source(s.slug)
    expect(read).toMatchObject({ deleted: true, members: [] })
    expect(read.series).not.toHaveProperty('deleted_at')
  })

  it('deletes on the target (unpublishing a live one), moves members out, audits once; a dry run keeps nothing', async () => {
    const member = await template()
    await publishFixture(db, member)
    const s = await series([member], true)
    expect(await syncDelete(s.slug, true)).toEqual({ result: 'deleted', moved: 1, was_live: true })
    expect(await seriesRow(s.id)).toMatchObject({ is_active: true, deleted_at: null })
    expect((await templateRow(member)).series_id).toBe(s.id)
    expect(await syncDelete(s.slug)).toEqual({ result: 'deleted', moved: 1, was_live: true })
    expect(await seriesRow(s.id)).toMatchObject({ is_active: false })
    expect((await seriesRow(s.id)).deleted_at).not.toBeNull()
    expect(await templateRow(member)).toMatchObject({ is_active: true, series_id: null })
    expect(await syncDelete(s.slug)).toEqual({ result: 'unchanged', moved: 0, was_live: false })
    expect(await syncDelete('series-del-never')).toEqual({ result: 'absent', moved: 0, was_live: false })
    expect(await audit(s.slug)).toEqual([{ action: 'series_sync_delete', user_id: admin,
      reason: `T93 sync from preview run ${run}: deleted on the test site, 1 templates moved out, was published` }])
  })

  it('never brings back a series deleted on the target', async () => {
    const t = await template()
    const s = await series()
    await remove(s.id)
    const definition = { slug: s.slug, name_en: 'Back', name_zh: '回来', description_en: null, description_zh: null,
      cover_url: null, category_key: 'pets', sort_order: 0, is_active: true, show_members: false }
    expect(await refused(() => asService('select public.sync_preview_series($1) as r', [definition]))).toBe('SERIES_DELETED')
    expect(await refused(() => asService('select public.sync_preview_series_active($1,$2,true,$3) as r', [admin, s.slug, run]))).toBe('SERIES_DELETED')
    expect(await refused(() => asService('select public.sync_preview_series_members($1,$2) as r', [s.slug, [t]]))).toBe('SERIES_DELETED')
    expect(await seriesRow(s.id)).toMatchObject({ is_active: false })
    expect((await templateRow(t)).series_id).toBeNull()
  })
})
