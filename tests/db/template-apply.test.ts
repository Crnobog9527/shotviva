import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildPlan } from '../../scripts/template-apply/plan'
import { batchResultSchema } from '../../scripts/template-apply/report'
import { parseBatch } from '../../scripts/template-apply/schema'
import { readState } from '../../scripts/template-apply/state'
import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

// `pnpm templates:apply` end to end against a real stack: the planner's ops through
// admin_apply_template_batch (migration 1260) into the admin's own functions.

const tag = randomUUID().slice(0, 8)
const root = `apply-root-${tag}`
const leaf = `apply-leaf-${tag}`
const slug = `apply-set-${tag}`
const [first, second, broken] = ['a', 'b', 'c'].map(x => `apply-${x}-${tag}`)
const provider = randomUUID()
const label = `Apply fixture ${tag}`
const secret = `PRIVATE PROMPT ${tag}`
const db = serviceSupabase()
let pg: Client
let actor: string

const fields = { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] }
const template = (id: string, extra: object = {}) => ({
  id, name: `Name ${id}`, description: 'Shown on the card', category: leaf, fields, quality: 'medium',
  creditsCost: { '1k': 120, '2k': 240, '3k': 360 }, model: label, prompt: { body: secret }, ...extra,
})
const batch = (extra: object = {}) => parseBatch({
  categories: [{ key: root, nameEn: `Root ${tag}`, nameZh: `根${tag}` }, { key: leaf, nameEn: `Leaf ${tag}`, nameZh: `叶${tag}`, parent: root }],
  series: [{ slug, nameEn: 'Set', nameZh: `套${tag}`, category: leaf, members: [second, first] }],
  templates: [template(first), template(second, { series: slug })],
  ...extra,
})

async function run(input: ReturnType<typeof batch>, dryRun: boolean) {
  const plan = await buildPlan(input, await readState(db, input), { baseDir: '/', write: false, db })
  expect(plan.flatMap(item => item.problems)).toEqual([])
  const items = plan.filter(i => i.ops.length).map(({ ref, ops }) => ({ ref, ops }))
  const { data, error } = await db.rpc('admin_apply_template_batch', { p_actor: actor, p_items: items, p_validate_only: dryRun })
  if (error) throw new Error(error.message)
  return batchResultSchema.parse(data)
}

const rows = async () => (await pg.query(`select t.id,t.category_key,t.subcategory_key,s.slug,t.series_sort_order,t.is_active,
  p.provider_id,coalesce(a.enabled,false) as sale from public.templates t join public.template_prompts p on p.template_id=t.id
  left join public.template_series s on s.id=t.series_id left join public.template_sale_approvals a on a.template_id=t.id
  where t.id=any($1) order by t.id`, [[first, second, broken]])).rows

beforeAll(async () => {
  pg = await connectAdmin()
  actor = await createUser(pg)
  await pg.query("update public.profiles set role='admin' where id=$1", [actor])
  await pg.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,estimated_image_costs)
    values($1,$2,'openai_images','apply-fixture','{1k,2k,3k}','{"1k":0.01,"2k":0.01,"3k":0.01}')`, [provider, label])
})

afterAll(async () => {
  await pg.query('delete from public.templates where id=any($1)', [[first, second, broken]])
  await pg.query('delete from public.template_series where slug=$1', [slug])
  await pg.query('delete from public.template_categories where key=any($1)', [[leaf, root]])
  await pg.query('delete from public.ai_providers where id=$1', [provider])
  await pg.query('delete from auth.users where id=$1', [actor])
  await pg.end()
})

describe('templates:apply', () => {
  it('dry run runs every admin function and keeps nothing', async () => {
    const results = await run(batch(), true)
    expect(results.every(r => r.ok)).toBe(true)
    expect(results.map(r => r.ref)).toEqual([`category:${root}`, `category:${leaf}`, `series:${slug}`,
      `template:${first}`, `template:${second}`, `series-members:${slug}`])
    expect(await rows()).toEqual([])
    expect((await pg.query('select 1 from public.template_categories where key=any($1)', [[root, leaf]])).rowCount).toBe(0)
  })

  it('applies a level-2 category, the model, the series and its order, and is idempotent', async () => {
    expect((await run(batch(), false)).every(r => r.ok)).toBe(true)
    const expected = (id: string, order: number) => ({ id, category_key: root, subcategory_key: leaf, slug, series_sort_order: order,
      is_active: false, provider_id: provider, sale: false })
    expect(await rows()).toEqual([expected(first, 2), expected(second, 1)])
    const again = await buildPlan(batch(), await readState(db, batch()), { baseDir: '/', write: false, db })
    expect(again.filter(i => i.ref.startsWith('category') || i.ref.startsWith('template')).flatMap(i => i.ops)).toEqual([])
  })

  it('isolates a failing item, reports only its code and never the prompt', async () => {
    const input = batch({ categories: [], series: [], templates: [template(broken, { category: `missing-${tag}` }), template(first, { name: 'Renamed' })] })
    const plan = await buildPlan(input, await readState(db, input), { baseDir: '/', write: false, db })
    const items = plan.map(({ ref, ops }) => ({ ref, ops }))
    const { data } = await db.rpc('admin_apply_template_batch', { p_actor: actor, p_items: items, p_validate_only: false })
    const results = batchResultSchema.parse(data)
    expect(results).toEqual([{ ref: `template:${broken}`, ok: false, code: 'CATEGORY_NOT_FOUND', detail: null, sqlstate: 'P0001', constraint: null },
      { ref: `template:${first}`, ok: true }])
    expect(JSON.stringify(results)).not.toContain(secret)
    expect((await pg.query('select name from public.templates where id=$1', [first])).rows[0].name).toBe('Renamed')
  })

  it('opens sale and publishes with the switch rules, and unpublishes before closing the sale', async () => {
    await pg.query("update public.templates set cover_before_url='https://assets.test/b.webp',cover_after_url='https://assets.test/a.webp' where id=$1", [first])
    const live = batch({ categories: [], series: [], templates: [{ id: first, openSale: true, publish: true }] })
    expect((await run(live, false)).every(r => r.ok)).toBe(true)
    expect((await rows()).find(r => r.id === first)).toMatchObject({ is_active: true, sale: true })
    const down = batch({ categories: [], series: [], templates: [{ id: first, openSale: false, publish: false, unpublishReason: 'test' }] })
    expect((await run(down, false)).every(r => r.ok)).toBe(true)
    expect((await rows()).find(r => r.id === first)).toMatchObject({ is_active: false, sale: false })
  })

  it('refuses a non-admin actor and is not callable by clients', async () => {
    const { error } = await db.rpc('admin_apply_template_batch', { p_actor: randomUUID(), p_items: [], p_validate_only: true })
    expect(error?.message).toBe('NOT_ADMIN')
    const grants = await pg.query(`select has_function_privilege('anon','public.admin_apply_template_batch(uuid,jsonb,boolean)','execute') a,
      has_function_privilege('authenticated','public.admin_apply_template_batch(uuid,jsonb,boolean)','execute') b`)
    expect(grants.rows[0]).toEqual({ a: false, b: false })
  })
})
