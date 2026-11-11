import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { readTemplateQuote } from '../../src/site/template-pricing'
import { connectAdmin, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'

// T93 sync carries the sub-category and series (2026-11-12). One database plays both projects, as
// in template-sync.test.ts: the RPCs are what changes, not the HTTP hops between them.
const tag = randomUUID().slice(0, 8)
const providerId = randomUUID()
const binding = { adapter: 'openai_images', model: providerId, base_url: 'https://model.example.test' }
const prompt = { body: 'QA fixture', version: 7, model_params: { test: true } }
const sub = `sync-sub-${tag}`
const otherSub = `sync-other-${tag}`
const seriesSlug = `sync-series-${tag}`
const templateIds: string[] = []
let db: Awaited<ReturnType<typeof connectAdmin>>
let series: string
let otherRoot: string

function fixture(over: Record<string, unknown> = {}) {
  const id = `t93a-${randomUUID()}`
  templateIds.push(id)
  return { id, module: 'image', name: 'QA', description: 'QA', category_key: 'pets', subcategory_key: sub,
    series_slug: seriesSlug, series_sort_order: 9,
    fields: { images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] }, translations: { zh: { name: '测试' } },
    quality: 'medium', credits_cost: { '1k': 1, '2k': 2, '3k': 3 }, visible_in: ['web'], cover_media_type: 'image',
    cover_before_url: 'https://example.test/b', cover_after_url: 'https://example.test/a', cover_locales: {}, ...over }
}

async function args(template: Record<string, unknown>, run: string) {
  const read = await serviceClient().rpc('read_template_sync_target', { p_id: template.id, p_run_id: run })
  const { token } = read.data as { token: string }
  const { floors, receipt, envModel } = await readTemplateQuote(serviceSupabase())
  return { p_template: template, p_prompt: prompt, p_provider: binding,
    p_floors: { ...floors, quote_receipt: receipt, env_model: envModel }, p_run_id: run,
    p_locales: ['en', 'zh'], p_target_token: token, p_catalog_version: 'v1' }
}
const write = async (template: Record<string, unknown>, run: string, validate = false) =>
  serviceClient().rpc('sync_preview_template', { ...await args(template, run), p_validate_only: validate })
const filed = async (id: string) =>
  (await db.query('select category_key,subcategory_key,series_id,series_sort_order from public.templates where id=$1', [id])).rows[0]

beforeAll(async () => {
  db = await connectAdmin()
  await db.query("insert into public.ai_providers(id,adapter,model,base_url,label) values ($1,$2,$3,$4,'sync fixture')",
    [providerId, binding.adapter, binding.model, binding.base_url])
  otherRoot = (await db.query("select key from public.template_categories where parent_id is null and not is_system and key<>'pets' order by key limit 1")).rows[0].key
  await db.query("insert into public.template_categories(key,name_en,name_zh,parent_id) values($1,'Sync sub','同步子类',$2),($3,'Sync other','同步别类',$4)", [sub, 'pets', otherSub, otherRoot])
  series = (await db.query("insert into public.template_series(slug,name_zh,name_en,category_key) values ($1,'集合','Set',$2) returning id", [seriesSlug, sub])).rows[0].id
  await db.query("insert into public.templates(id,name,category_key,series_id,series_sort_order) values($1,'member','pets',$2,4)", [`t93a-member-${tag}`, series])
  templateIds.push(`t93a-member-${tag}`)
})
afterAll(async () => {
  await db.query('delete from public.templates where id = any($1::text[])', [templateIds])
  await db.query('delete from public.template_series where id=$1', [series])
  await db.query('delete from public.template_categories where key = any($1::text[])', [[sub, otherSub]])
  await db.query('delete from public.ai_providers where id=$1', [providerId])
  await db.end()
})

it('reads the sub-category, the series slug and its order from the source', async () => {
  await db.query("insert into public.templates(id,name,category_key,subcategory_key,series_id,series_sort_order) values($1,'src','pets',$2,$3,6)", [`t93a-src-${tag}`, sub, series])
  templateIds.push(`t93a-src-${tag}`)
  const { data } = await serviceClient().rpc('read_template_sync_source', { p_id: `t93a-src-${tag}` })
  const { template } = data as { template: Record<string, unknown> }
  expect(template).toMatchObject({ category_key: 'pets', subcategory_key: sub, series_slug: seriesSlug, series_sort_order: 6 })
  expect(template).not.toHaveProperty('series_id')
})

it('files a new template under the same sub-category and series, appended to the series', async () => {
  const template = fixture()
  expect(await write(template, '1', true)).toEqual({ data: 1, error: null })
  expect((await db.query('select 1 from public.templates where id=$1', [template.id])).rowCount).toBe(0)
  expect(await write(template, '1')).toEqual({ data: 1, error: null })
  expect(await filed(template.id)).toEqual({ category_key: 'pets', subcategory_key: sub, series_id: series, series_sort_order: 5 })
  // Re-synced in the same series it keeps its place; leaving the test site's series clears it here.
  await db.query('update public.templates set series_sort_order=2 where id=$1', [template.id])
  expect((await write(template, '2')).error).toBeNull()
  expect(await filed(template.id)).toMatchObject({ series_id: series, series_sort_order: 2 })
  expect((await write({ ...template, subcategory_key: null, series_slug: null }, '3')).error).toBeNull()
  expect(await filed(template.id)).toEqual({ category_key: 'pets', subcategory_key: null, series_id: null, series_sort_order: 0 })
})

it('fails the template, writing nothing, when production lacks the sub-category or series', async () => {
  const template = fixture()
  const cases = [
    [{ subcategory_key: `missing-${tag}` }, 'SUBCATEGORY_MISSING'],
    [{ subcategory_key: otherSub }, 'SUBCATEGORY_MISSING'],
    [{ subcategory_key: 'pets' }, 'SUBCATEGORY_MISSING'],
    [{ series_slug: `missing-${tag}` }, 'SERIES_MISSING'],
  ] as const
  for (const [over, reason] of cases) expect((await write({ ...template, ...over }, '1')).error?.message).toBe(reason)
  expect((await db.query('select 1 from public.templates where id=$1', [template.id])).rowCount).toBe(0)
})

it('leaves production’s own filing alone when the payload predates the new keys', async () => {
  const template = fixture()
  expect((await write(template, '1')).error).toBeNull()
  const legacy = Object.fromEntries(Object.entries(template).filter(([key]) => !['subcategory_key', 'series_slug', 'series_sort_order'].includes(key)))
  expect((await write({ ...legacy, name: 'QA legacy' }, '2')).error).toBeNull()
  expect(await filed(template.id)).toMatchObject({ subcategory_key: sub, series_id: series })
})
