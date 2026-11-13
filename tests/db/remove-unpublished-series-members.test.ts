import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { connectAdmin, publishFixture } from './helpers'

// 1403: the one-time cleanup takes every unpublished member out of its series, renumbers the rest
// of that series 1, 2, 3…, leaves other series alone, and changes nothing on a second run. A
// series left without a visible member stays off the site.

const category = 'qa-series-cleanup'
const live = ['qa-clean-a', 'qa-clean-c', 'qa-clean-x']
const down = ['qa-clean-b', 'qa-clean-z']
let pg: Client
let mixed: string
let emptied: string
let untouched: string

const members = async (series: string) =>
  (await pg.query('select id,series_sort_order from public.templates where series_id=$1 order by series_sort_order,id', [series])).rows
const listed = async (series: string) =>
  (await pg.query('select 1 from public.web_catalogue_entries where series_id=$1', [series])).rowCount

async function series(slug: string) {
  const { rows } = await pg.query(`insert into public.template_series(slug,name_en,name_zh,category_key,is_active)
    values ($1,'S','S',$2,true) returning id`, [slug, category])
  return rows[0].id as string
}
const place = (series: string, id: string, order: number) =>
  pg.query('update public.templates set series_id=$1, series_sort_order=$3 where id=$2', [series, id, order])

beforeAll(async () => {
  pg = await connectAdmin()
  await pg.query("insert into public.template_categories(key,name_en,name_zh) values($1,'QA cleanup','清理测试')", [category])
  await pg.query(`insert into public.templates(id,name,category_key,fields,cover_after_url,is_active,visible_in)
    select id,id,$2,'{"images":{"min":1,"max":1},"copy":[],"aspectRatios":["1:1"]}','https://example.test/m.webp',false,array['web']
    from unnest($1::text[]) id`, [[...live, ...down], category])
  await publishFixture(pg, ...live)
  mixed = await series('qa-clean-mixed')
  emptied = await series('qa-clean-emptied')
  untouched = await series('qa-clean-untouched')
  // A draft that was never published can sit in a series (1400 only reacts to 上架 → 下架); these
  // stand for the members that were already unpublished before 1400.
  await place(mixed, 'qa-clean-a', 1)
  await place(mixed, 'qa-clean-b', 2)
  await place(mixed, 'qa-clean-c', 3)
  await place(emptied, 'qa-clean-z', 1)
  await place(untouched, 'qa-clean-x', 10)
})

afterAll(async () => {
  await pg.query('delete from public.templates where category_key=$1', [category])
  await pg.query('delete from public.template_series where category_key=$1', [category])
  await pg.query('delete from public.template_categories where key=$1', [category])
  await pg.end()
})

it('removes unpublished members, renumbers only the series they left, and is idempotent', async () => {
  expect(await listed(emptied)).toBe(0) // its only member is unpublished: hidden before…
  const { rows } = await pg.query('select admin.remove_unpublished_series_members() as n')
  expect(rows[0].n).toBeGreaterThanOrEqual(down.length) // other rows in this database may match too
  expect(await members(mixed)).toEqual([{ id: 'qa-clean-a', series_sort_order: 1 }, { id: 'qa-clean-c', series_sort_order: 2 }])
  expect(await members(emptied)).toEqual([])
  expect(await members(untouched)).toEqual([{ id: 'qa-clean-x', series_sort_order: 10 }])
  const removed = await pg.query('select series_id,series_sort_order from public.templates where id=any($1)', [down])
  expect(removed.rows).toEqual([{ series_id: null, series_sort_order: 0 }, { series_id: null, series_sort_order: 0 }])
  expect(await listed(emptied)).toBe(0) // …and after: a series with no visible member stays hidden
  expect(await listed(mixed)).toBe(1)
  expect((await pg.query('select admin.remove_unpublished_series_members() as n')).rows[0].n).toBe(0)
  expect(await members(mixed)).toEqual([{ id: 'qa-clean-a', series_sort_order: 1 }, { id: 'qa-clean-c', series_sort_order: 2 }])
})

it('cannot be called by the service role', async () => {
  await pg.query('set role service_role')
  try {
    await expect(pg.query('select admin.remove_unpublished_series_members()')).rejects.toThrow(/permission denied/)
  } finally {
    await pg.query('reset role')
  }
})
