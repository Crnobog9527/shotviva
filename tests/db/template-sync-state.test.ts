import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { connectAdmin, createUser } from './helpers'

// T93 sync, 上下架 and 开放售卖 (2026-11-12, migrations 1273–1274): production follows the test site
// through its own checks, as a named admin, audited. Each test runs in a transaction rolled back after.
let db: Client
let admin: string
const run = '777'
const fields = { images: { min: 1, max: 1 }, aspectRatios: ['1:1'], copy: [] }

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  admin = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [admin])
})
afterEach(async () => { await db.query('rollback'); await db.end() })

async function draft(visible: string[] = ['partner'], extra: Record<string, unknown> = {}) {
  const id = `sync-state-${randomUUID()}`
  await db.query(`insert into public.templates(id,name,category,fields,credits_cost,is_active,visible_in,description,cover_before_url,cover_after_url)
    values($1,$1,'pets',$2,'{"1k":120,"2k":120,"3k":120}',false,$3,$4,$5,$6)`,
  [id, fields, visible, extra.description ?? null, extra.before ?? null, extra.after ?? null])
  await db.query("insert into public.template_prompts(template_id,body) values($1,'fixture')", [id])
  return id
}
const state = (id: string, sale: boolean, active: boolean, validate = false, actor = admin) =>
  db.query('select public.sync_preview_template_state($1,$2,$3,$4,$5,$6,$7) as r', [actor, id, sale, active, run, ['en', 'zh'], validate])
    .then((result) => result.rows[0].r)
const row = async (id: string) => (await db.query(`select t.is_active, coalesce(s.enabled,false) as sale from public.templates t
  left join public.template_sale_approvals s on s.template_id=t.id where t.id=$1`, [id])).rows[0]
const audit = async (target: string) => (await db.query(
  'select action,user_id,reason from public.admin_audit_log where target_id=$1 order by id', [target])).rows
async function refused(work: () => Promise<unknown>) {
  await db.query('savepoint attempt')
  try {
    await work()
    return null
  } catch (error) {
    await db.query('rollback to attempt')
    return (error as Error).message
  }
}

it('opens the sale and publishes a new template, auditing both as the sync run', async () => {
  const id = await draft()
  expect(await state(id, true, true)).toEqual({ sale: 'opened', active: 'published' })
  expect(await row(id)).toEqual({ is_active: true, sale: true })
  expect(await audit(id)).toEqual([
    { action: 'template_sync_sale', user_id: admin, reason: `T93 sync from preview run ${run}: sale opened` },
    { action: 'template_sync_active', user_id: admin, reason: `T93 sync from preview run ${run}: published` },
  ])
  expect((await db.query('select count(*)::int as n from admin.template_sale_events where template_id=$1 and actor_id=$2', [id, admin])).rows[0].n).toBe(1)
  expect(await state(id, true, true)).toEqual({ sale: 'unchanged', active: 'unchanged' })
})

it('puts back the test site’s state after a manual unpublish on production, and takes it down in the safe order', async () => {
  const id = await draft()
  await state(id, true, true)
  await db.query('update public.templates set is_active=false where id=$1', [id])
  expect(await state(id, true, true)).toEqual({ sale: 'unchanged', active: 'published' })
  expect(await state(id, false, false)).toEqual({ sale: 'closed', active: 'unpublished' })
  expect(await row(id)).toEqual({ is_active: false, sale: false })
  expect((await audit(id)).map((entry) => entry.reason.split(': ')[1])).toEqual(['sale opened', 'published', 'published', 'unpublished', 'sale closed'])
})

it('refuses what production refuses and changes nothing, the sale included', async () => {
  const incomplete = await draft(['web'])
  expect(await refused(() => state(incomplete, true, true))).toBe('LIVE_TEMPLATE_INCOMPLETE')
  const cheap = await draft()
  await db.query(`update public.templates set credits_cost='{"1k":1,"2k":1,"3k":1}' where id=$1`, [cheap])
  expect(await refused(() => state(cheap, true, true))).toMatch(/BELOW_FLOOR|FLOOR/)
  for (const id of [incomplete, cheap]) {
    expect(await row(id)).toEqual({ is_active: false, sale: false })
    expect(await audit(id)).toEqual([])
  }
  const stranger = await createUser(db)
  expect(await refused(() => state(cheap, true, true, false, stranger))).toBe('NOT_ADMIN')
  expect(await refused(() => state(cheap, false, true))).toBe('INVALID_SYNC')
})

it('publishes a complete web template only when it would also be visible on the site', async () => {
  const id = await draft(['web'], { description: 'One line.', before: 'https://a.test/b.webp', after: 'https://a.test/a.webp' })
  const outcome = await refused(() => state(id, true, true))
  if (outcome === null) {
    expect((await db.query('select admin.web_standard_sale_allowed($1) as ok', [id])).rows[0].ok).toBe(true)
  } else {
    expect(outcome).toBe('SALE_ROUTE_NOT_ALLOWED')
    expect(await row(id)).toEqual({ is_active: false, sale: false })
  }
})

it('dry run reports the change and keeps nothing', async () => {
  const id = await draft()
  expect(await state(id, true, true, true)).toEqual({ sale: 'opened', active: 'published' })
  expect(await row(id)).toEqual({ is_active: false, sale: false })
  expect(await audit(id)).toEqual([])
})

it('takes a series up and down by slug, audited, and dry run keeps nothing', async () => {
  const slug = `sync-state-${randomUUID().slice(0, 8)}`
  await db.query("insert into public.template_series(slug,name_en,name_zh,category_key) values($1,'Set','套系','pets')", [slug])
  const series = (active: boolean, validate = false) => db.query('select public.sync_preview_series_active($1,$2,$3,$4,$5) as r',
    [admin, slug, active, run, validate]).then((result) => result.rows[0].r)
  expect(await series(true, true)).toBe('published')
  expect(await series(true)).toBe('published')
  expect(await series(true)).toBe('unchanged')
  expect(await series(false)).toBe('unpublished')
  expect((await audit(slug)).map((entry) => entry.action + ' ' + entry.reason)).toEqual([
    `series_sync_active T93 sync from preview run ${run}: published`, `series_sync_active T93 sync from preview run ${run}: unpublished`,
  ])
  expect(await refused(() => db.query('select public.sync_preview_series_active($1,$2,true,$3)', [admin, `missing-${slug}`, run]))).toBe('SERIES_MISSING')
})
