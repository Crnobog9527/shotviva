import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { bulkEditTemplates, listAdminTemplates, saveTemplate } from '@/core/admin'
import { CREDITS_FLOOR } from '@/modules/image/credits-floor'
import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

const db = serviceSupabase()
const leaf = 'ed-tax-leaf'
const mid = 'ed-tax-middle'
const member = 'ed-tax-member'
const item = 'ed-tax-template'
let sql: Client
let actor: string
let series: string

const template = (category: string, name = item) => ({
  id: item, category, name, quality: 'high', creditsCost: { '1k': 2, '2k': 4, '3k': 6 }, visibleIn: ['partner'],
  fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] },
})
const prompt = { body: 'private fixture', modelParams: {} }
const snapshot = (category: string, group: string | null) => ({ previousCategory: category, previousSeriesId: group })
const read = async () => (await sql.query('select name,category,category_key,subcategory_key,series_id,series_sort_order from public.templates where id=$1', [item])).rows[0]

beforeAll(async () => {
  sql = await connectAdmin()
  actor = await createUser(sql)
  await sql.query("update public.profiles set role='admin' where id=$1", [actor])
  for (const [key, parent] of [[mid, 'pets'], [leaf, mid]]) {
    await sql.query('insert into public.template_categories(key,name_en,name_zh,parent_id) values($1,$1,$3,$2)', [key, parent, key === mid ? '编辑二级' : '编辑三级'])
  }
  series = (await sql.query("insert into public.template_series(slug,name_zh,name_en,category_key) values ('ed-tax-series','集合','Set',$1) returning id", [leaf])).rows[0].id
  await sql.query("insert into public.templates(id,name,category_key,series_id,series_sort_order) values($1,$1,'pets',$2,5)", [member, series])
})

afterAll(async () => {
  await sql.query('delete from public.templates where id=any($1)', [[item, member]])
  await sql.query('delete from public.template_series where id=$1', [series])
  for (const key of [leaf, mid]) await sql.query('delete from public.template_categories where key=$1', [key])
  await sql.query('delete from auth.users where id=$1', [actor])
  await sql.end()
})

it('creates at a third-level node with the legacy English root, appends to a series, and keeps rank on versioned edits', async () => {
  const version = await saveTemplate(db, actor, { template: template(leaf), isNew: true, prompt, assignment: { seriesId: series } }, CREDITS_FLOOR)
  expect(version).toBe(1)
  expect(await read()).toMatchObject({ category: 'Pets', category_key: 'pets', subcategory_key: leaf, series_id: series, series_sort_order: 6 })
  expect((await listAdminTemplates(db)).find(t => t.id === item)).toMatchObject({ category: 'pets', subcategoryKey: leaf, seriesId: series, seriesSortOrder: 6 })
  await sql.query('update public.templates set series_sort_order=12 where id=$1', [item])
  await saveTemplate(db, actor, { template: template(mid), isNew: false, prompt, revision: { expected: 1 },
    assignment: { ...snapshot(leaf, series), seriesId: series } }, CREDITS_FLOOR)
  expect(await read()).toMatchObject({ subcategory_key: mid, series_id: series, series_sort_order: 12 })
})

it('keeps changes from other editors and atomically rejects an invalid series or stale prompt', async () => {
  const before = await read()
  const write = (previous: string, next: string | null, expected = 1) => saveTemplate(db, actor, {
    template: template(leaf, 'Should not persist'), isNew: false, prompt, revision: { expected },
    assignment: { ...snapshot(previous, series), seriesId: next },
  }, CREDITS_FLOOR)
  await expect(write(leaf, null)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  await expect(write(mid, '85072ca6-2d3f-4060-9848-09284354f213')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  await expect(write(mid, null, 3)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect(await read()).toEqual(before)
  await write(mid, null)
  expect(await read()).toMatchObject({ subcategory_key: leaf, series_id: null, series_sort_order: 0 })
})

it('moves all assigned nodes with the T79 patch or leaves the entire batch alone, including when returning to the same root', async () => {
  const batch = (ids: string[], categoryKey: string) => bulkEditTemplates(db, actor, {
    ids, patch: { categoryKey, quality: 'medium' },
  }, CREDITS_FLOOR)
  expect((await batch([item, 'freeform'], mid)).changed).toBe(0)
  expect(await read()).toMatchObject({ subcategory_key: leaf })
  expect((await batch([item, member], mid)).changed).toBe(2)
  const rows = await sql.query('select category_key,subcategory_key,quality from public.templates where id=any($1)', [[item, member]])
  for (const row of rows.rows) expect(row).toEqual({ category_key: 'pets', subcategory_key: mid, quality: 'medium' })
  expect((await batch([item, member], 'pets')).changed).toBe(2)
  expect(await read()).toMatchObject({ category_key: 'pets', subcategory_key: null })
})

it('keeps both RPCs service-only and verifies the acting admin', async () => {
  for (const fn of ['admin_save_template_assignment(uuid,jsonb,jsonb,jsonb,boolean,integer,integer,jsonb)', 'admin_bulk_assign_templates(text[],jsonb,jsonb,uuid,text[])']) {
    const grants = await sql.query("select has_function_privilege('anon',$1,'execute') as anon,has_function_privilege('authenticated',$1,'execute') as auth,has_function_privilege('service_role',$1,'execute') as service", ['public.' + fn])
    expect(grants.rows[0]).toEqual({ anon: false, auth: false, service: true })
  }
  const dummy = '66666666-0000-4000-8000-000000000001'
  await expect(saveTemplate(db, dummy, { template: template(mid), isNew: false, prompt, assignment: { ...snapshot('pets', null), seriesId: null } }, CREDITS_FLOOR)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(bulkEditTemplates(db, dummy, { ids: [item], patch: { categoryKey: leaf } }, CREDITS_FLOOR)).rejects.toMatchObject({ code: 'FORBIDDEN' })
})

it('reads beyond the first catalogue page and preserves catalogue order across primary-key pages', async () => {
  await sql.query(`insert into public.templates(id,name,category_key,sort_order)
    select 'ed-tax-page-'||lpad(i::text,4,'0'),'Page fixture','pets',-i
      from generate_series(1,251) i`)
  try {
    const rows = (await listAdminTemplates(db)).filter(t => t.id.startsWith('ed-tax-page-'))
    expect(rows).toHaveLength(251)
    expect(rows.map(t => t.sortOrder)).toEqual(Array.from({ length: 251 }, (_, i) => i - 251))
  } finally {
    await sql.query("delete from public.templates where id like 'ed-tax-page-%'")
  }
})

it('returns INVALID_INPUT for malformed current or previous series IDs at the RPC boundary', async () => {
  for (const assignment of [{ series_id: 'bad' }, { series_id: null, previous_series_id: 'bad' }]) {
    const { error } = await db.rpc('admin_save_template_assignment', {
      p_actor: actor, p_template: { id: item }, p_prompt: {}, p_assignment: assignment, p_is_new: false,
    })
    expect(error?.message).toBe('INVALID_INPUT')
  }
})

it('rejects a banned admin before saving a category, moving it or saving a series', async () => {
  await sql.query('begin')
  try {
    await sql.query('update public.profiles set banned_at=now() where id=$1', [actor])
    for (const call of [
      "admin_save_template_category('{}',true,$1)",
      'admin_move_template_category(null,null,null,null,$1)',
      "admin_save_template_series(null,null,'{}','{}',$1,null)",
    ]) {
      await sql.query('savepoint denied')
      await expect(sql.query('select public.' + call, [actor])).rejects.toMatchObject({ message: 'NOT_ADMIN' })
      await sql.query('rollback to denied')
    }
  } finally {
    await sql.query('rollback')
  }
})
