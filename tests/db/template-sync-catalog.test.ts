import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { anonClient, connectAdmin, serviceClient } from './helpers'

// T93 sync of categories and series (2026-11-12, migrations 1270–1271). One database plays both
// projects: the RPCs are what is tested, with payloads shaped as the source functions return them.
const tag = randomUUID().slice(0, 8)
const key = (name: string) => `sc-${name}-${tag}`
const templateIds: string[] = []
const seriesSlugs: string[] = []
const categoryKeys: string[] = []
let db: Awaited<ReturnType<typeof connectAdmin>>

const rpc = (name: string, args: Record<string, unknown>) => serviceClient().rpc(name, args)
const category = (k: string, parent: string | null, over: Record<string, unknown> = {}) => ({
  key: k, parent_id: parent, level: parent ? 2 : 1, is_system: false, name_en: `En ${k}`.slice(0, 32),
  name_zh: `类${k.slice(-6)}`, intro_en: null, intro_zh: null, card_style: 'pair', sort_order: 40, slug: k,
  is_visible: true, seo_title_en: null, seo_title_zh: null, seo_description_en: null, seo_description_zh: null, ...over,
})
const series = (slug: string, over: Record<string, unknown> = {}) => ({
  slug, name_en: 'Set', name_zh: '套系', description_en: 'One set.', description_zh: '一套。',
  cover_url: 'https://example.test/series.png', category_key: 'pets', sort_order: 3, is_active: false, show_members: true, ...over,
})
async function template(id: string, seriesId: string | null = null, order = 0) {
  templateIds.push(id)
  await db.query('insert into public.templates(id,name,category_key,series_id,series_sort_order) values($1,$1,$2,$3,$4)', [id, 'pets', seriesId, order])
}
const members = async (slug: string) => (await db.query(
  'select t.id,t.series_sort_order from public.templates t join public.template_series s on s.id=t.series_id where s.slug=$1 order by t.series_sort_order,t.id', [slug])).rows

beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => {
  await db.query('delete from public.templates where id = any($1::text[])', [templateIds])
  await db.query('delete from public.template_series where slug = any($1::text[])', [seriesSlugs])
  await db.query('delete from public.template_categories where key = any($1::text[])', [[...categoryKeys].reverse()])
  await db.end()
})

it('reads a category with its ancestors, parents first', async () => {
  const child = key('read')
  categoryKeys.push(child)
  await db.query("insert into public.template_categories(key,name_en,name_zh,parent_id) values($1,'Read child','读取子类',$2)", [child, 'pets'])
  const { data } = await rpc('read_template_category_sync_source', { p_keys: [child] })
  expect((data as { key: string }[]).map((row) => row.key)).toEqual(['pets', child])
})

it('creates a missing category under its parent, then only follows names and position; dry run keeps nothing', async () => {
  const k = key('new')
  categoryKeys.push(k)
  expect(await rpc('sync_preview_category', { p_category: category(k, 'pets'), p_validate_only: true })).toMatchObject({ data: 'created', error: null })
  expect((await db.query('select 1 from public.template_categories where key=$1', [k])).rowCount).toBe(0)
  expect((await rpc('sync_preview_category', { p_category: category(k, 'pets') })).data).toBe('created')
  expect((await db.query('select parent_id,level,sort_order,slug from public.template_categories where key=$1', [k])).rows[0])
    .toEqual({ parent_id: 'pets', level: 2, sort_order: 40, slug: k })
  const renamed = category(k, null, { name_zh: '新名字', sort_order: 7, slug: 'other-slug' })
  expect((await rpc('sync_preview_category', { p_category: renamed })).data).toBe('updated')
  expect((await db.query('select parent_id,name_zh,sort_order,slug from public.template_categories where key=$1', [k])).rows[0])
    .toEqual({ parent_id: 'pets', name_zh: '新名字', sort_order: 7, slug: k })
  expect((await rpc('sync_preview_category', { p_category: renamed })).data).toBe('unchanged')
})

it('leaves system categories alone and refuses what production cannot hold', async () => {
  const system = (await db.query('select key,name_en,name_zh,sort_order from public.template_categories where is_system limit 1')).rows[0]
  expect((await rpc('sync_preview_category', { p_category: category(system.key, null, { is_system: true, name_zh: '改' }) })).data).toBe('system')
  expect((await db.query('select name_zh from public.template_categories where key=$1', [system.key])).rows[0].name_zh).toBe(system.name_zh)
  const cases = [
    [category(key('orphan'), `missing-${tag}`), 'CATEGORY_PARENT_MISSING'],
    [category(key('dup'), 'pets', { name_zh: system.name_zh }), 'CATEGORY_NAME_TAKEN'],
    [category(key('sys'), null, { is_system: true }), 'CATEGORY_MISSING'],
  ] as const
  for (const [payload, reason] of cases) expect((await rpc('sync_preview_category', { p_category: payload })).error?.message).toBe(reason)
})

it('reads a series by slug with its members in order, and creates or updates it by slug', async () => {
  const slug = key('set')
  seriesSlugs.push(slug)
  expect((await rpc('sync_preview_series', { p_series: series(slug), p_validate_only: true })).data).toBe('created')
  expect((await db.query('select 1 from public.template_series where slug=$1', [slug])).rowCount).toBe(0)
  expect((await rpc('sync_preview_series', { p_series: series(slug) })).data).toBe('created')
  const id = (await db.query('select id from public.template_series where slug=$1', [slug])).rows[0].id
  await template(key('m2'), id, 2)
  await template(key('m1'), id, 1)
  const { data } = await rpc('read_template_series_sync_source', { p_slug: slug })
  expect(data).toEqual({ series: series(slug), members: [key('m1'), key('m2')] })
  expect((await rpc('read_template_series_sync_source', { p_slug: `missing-${tag}` })).data).toBeNull()
  expect((await rpc('sync_preview_series', { p_series: series(slug, { name_zh: '新套系', is_active: true }) })).data).toBe('updated')
  expect((await db.query('select id,name_zh,is_active,show_members from public.template_series where slug=$1', [slug])).rows[0])
    .toEqual({ id, name_zh: '新套系', is_active: true, show_members: true })
  expect((await rpc('sync_preview_series', { p_series: series(slug, { category_key: `missing-${tag}` }) })).error?.message).toBe('SERIES_CATEGORY_MISSING')
})

it('sets the members exactly as listed, skipping missing or taken ones; dry run keeps nothing', async () => {
  const slug = key('order')
  const other = key('other')
  seriesSlugs.push(slug, other)
  for (const s of [slug, other]) expect((await rpc('sync_preview_series', { p_series: series(s) })).error).toBeNull()
  const [id, otherId] = await Promise.all([slug, other].map(async (s) => (await db.query('select id from public.template_series where slug=$1', [s])).rows[0].id))
  await template(key('a'))
  await template(key('b'))
  await template(key('leaving'), id, 1)
  await template(key('taken'), otherId, 1)
  const listed = [key('b'), key('a'), `missing-${tag}`, key('taken')]
  const dry = await rpc('sync_preview_series_members', { p_slug: slug, p_members: listed, p_validate_only: true })
  expect(dry.data).toEqual({ placed: [key('b'), key('a')], skipped: [`missing-${tag}`, key('taken')] })
  expect(await members(slug)).toEqual([{ id: key('leaving'), series_sort_order: 1 }])
  expect((await rpc('sync_preview_series_members', { p_slug: slug, p_members: listed })).error).toBeNull()
  expect(await members(slug)).toEqual([{ id: key('b'), series_sort_order: 1 }, { id: key('a'), series_sort_order: 2 }])
  expect(await members(other)).toEqual([{ id: key('taken'), series_sort_order: 1 }])
  expect((await rpc('sync_preview_series_members', { p_slug: `missing-${tag}`, p_members: [] })).error?.message).toBe('SERIES_MISSING')
  expect((await rpc('sync_preview_series_members', { p_slug: slug, p_members: [key('a'), key('a')] })).error?.message).toBe('INVALID_SERIES_MEMBERS')
})

it('denies clients the source reads and the writes', async () => {
  for (const [name, args] of [
    ['read_template_category_sync_source', { p_keys: ['pets'] }], ['sync_preview_category', { p_category: category(key('x'), null) }],
    ['read_template_series_sync_source', { p_slug: 'x' }], ['sync_preview_series', { p_series: series(key('x')) }],
    ['sync_preview_series_members', { p_slug: 'x', p_members: [] }],
  ] as const) expect((await anonClient().rpc(name, args)).error).not.toBeNull()
})
