import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listTemplates, listTemplatesIn } from '@/core/templates'
import { toPartnerTemplate } from '@/core/partner/partner-views'
import { readCategoryEntries, readCategoryTree, readSeriesMembers } from '@/core/templates/taxonomy-reads'
import { connectAdmin, createUser, retryAuth } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

const anon = anonSupabase()
const service = serviceSupabase()
let pg: Client
let admin: string
let series: string
const root = 't102-food'
const dark = 't102-dark'
const leaf = 't102-dish'
const plain = 't102-single'
const member = 't102-member'
const path = ['t102-food', 'dark', 'dish']

function node(key: string, parent: string | null, slug: string, kind = 'template') {
  return pg.query(`insert into public.template_categories(key,name_en,name_zh,parent_id,slug,kind)
    values($1,$1,$1,$2,$3,$4)`, [key, parent, slug, kind])
}

async function expectCategoryRows(client: SupabaseClient, visible: readonly string[]) {
  const keys = [root, dark, leaf]
  const categories = await client.from('template_categories')
    .select('key,name_en,name_zh,seo_title_en,seo_title_zh,seo_description_en,seo_description_zh').in('key', keys).throwOnError()
  const paths = await client.from('template_category_paths').select('key,path').in('key', keys).throwOnError()
  const expected = [...visible].sort()
  expect(categories.data?.map(c => c.key).sort()).toEqual(expected)
  expect(paths.data?.map(c => c.key).sort()).toEqual(expected)
}

beforeAll(async () => {
  pg = await connectAdmin()
  admin = await createUser(pg)
  await pg.query("update public.profiles set role='admin' where id=$1", [admin])
  await node(root, null, root)
  await node(dark, root, 'dark')
  await node(leaf, dark, 'dish')
  await node('t102-ref', null, root, 'reference')
  const added = await pg.query("insert into public.template_series(slug,name_en,name_zh,category_key,is_active) values('t102-set','Set','一组',$1,true) returning id", [dark])
  series = added.rows[0].id
  const fields = { images: { min: 1, max: 1 }, aspectRatios: ['1:1'], copy: [] }
  for (const [id, group, surfaces] of [[plain, null, ['web', 'partner']], [member, series, ['web', 'partner']], ['t102-api', series, ['partner']]] as const) {
    await pg.query(`insert into public.templates(id,name,category_key,subcategory_key,series_id,is_active,visible_in,fields,cover_after_url)
      values($1,$1,$2,$3,$4,true,$5,$6,'https://example.test/dish.webp')`, [id, root, leaf, group, surfaces, fields])
  }
})

afterAll(async () => {
  await pg.query("delete from public.templates where id like 't102-%'")
  await pg.query("delete from public.template_series where slug like 't102-%'")
  await pg.query("delete from public.template_categories where key like 't102-%'")
  await pg.query('delete from auth.users where id=$1', [admin])
  await pg.end()
})

describe('three-level catalogue', () => {
  it('enforces depth, kind, cycles and sibling slugs and isolates reference categories', async () => {
    await expect(node('t102-depth', leaf, 'x')).rejects.toThrow(/level/)
    await expect(node('t102-mixed', dark, 'x', 'reference')).rejects.toThrow(/INVALID_PARENT/)
    await expect(node('t102-dup', dark, 'dish')).rejects.toThrow(/sibling_slug/)
    await expect(pg.query('update public.template_categories set parent_id=$1 where key=$2', [leaf, dark])).rejects.toThrow()
    await expect(node('t102-other', root, 'dish')).resolves.toBeDefined()
    expect((await anon.from('template_categories').select('key').eq('kind', 'reference')).data).toEqual([])
    expect((await anon.from('template_series').update({ is_active: false }).eq('id', series)).error).toBeTruthy()
    expect((await readCategoryTree(anon)).find(n => n.key === root)?.children.find(n => n.key === dark)?.children[0].path).toEqual(path)
  })

  it('protects a hidden category and its descendants in direct table, path and template reads', async () => {
    const email = `t102-${randomUUID()}@example.test`
    const password = randomUUID()
    const user = await retryAuth(async () => {
      const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
      if (error || !data.user) throw error ?? new Error('No test user')
      return data.user
    })
    try {
      const signedIn = anonSupabase()
      await retryAuth(async () => {
        const { error } = await signedIn.auth.signInWithPassword({ email, password })
        if (error) throw error
      })
      for (const [hidden, visible] of [[root, []], [dark, [root]], [leaf, [root, dark]]] as const) {
        await pg.query('update public.template_categories set is_visible=(key<>$1) where key=any($2)', [hidden, [root, dark, leaf]])
        for (const client of [anon, signedIn]) {
          await expectCategoryRows(client, visible)
          const template = await client.from('templates').select('category,category_key,subcategory_key').eq('id', plain).throwOnError()
          expect(template.data).toEqual([])
        }
        await expectCategoryRows(service, [root, dark, leaf])
        const pathRow = await service.from('template_category_paths').select('web_visible').eq('key', leaf).single().throwOnError()
        expect(pathRow.data?.web_visible).toBe(false)
      }
    } finally {
      await pg.query('update public.template_categories set is_visible=true where key=any($1)', [[root, dark, leaf]])
      await pg.query('delete from auth.users where id=$1', [user.id])
    }
    await expectCategoryRows(anon, [root, dark, leaf])
  })

  it('filters a subtree, lists a series once, and exposes its usable members through the workspace and partner contract', async () => {
    const entries = await readCategoryEntries(anon, [root], 'zh')
    expect(entries.items).toEqual([
      { type: 'series', series: { id: series, slug: 't102-set', name: '一组', description: null, coverUrl: 'https://example.test/dish.webp' } },
      { type: 'template', template: expect.objectContaining({ id: plain, category: root }) },
    ])
    expect((await readCategoryEntries(anon, path, 'en')).items.map(x => x.type)).toEqual(['template'])
    expect((await readCategoryEntries(service, [root, 'dish', 'dark'], 'en')).items).toEqual([])
    expect((await readSeriesMembers(anon, series, 'en')).items.map(t => t.id)).toEqual([member])
    expect((await listTemplatesIn(anon, 'en', { id: member }))[0]?.id).toBe(member)
    const available = await listTemplatesIn(anon, 'en', { includeSeriesMembers: true })
    expect(available.find(template => template.id === member)?.name).toBe(member)
    expect((await listTemplatesIn(anon, 'en')).some(template => template.id === member)).toBe(false)
    const partner = (await listTemplates(service, 'partner')).find(t => t.id === member)
    expect(toPartnerTemplate(partner!)).toMatchObject({ category: root, category_path: path, series: { id: series, slug: 't102-set', name: 'Set' } })
    await pg.query('update public.template_series set show_members=true where id=$1', [series])
    expect((await readCategoryEntries(service, [root], 'en')).items).toHaveLength(3)
    await pg.query('update public.template_series set is_active=false where id=$1', [series])
    for (const client of [anon, service]) {
      expect((await readCategoryEntries(client, [root], 'en')).items.map(x => x.type)).toEqual(['template'])
      expect((await readSeriesMembers(client, series, 'en')).items).toEqual([])
      expect(await listTemplatesIn(client, 'en', { id: member })).toEqual([])
      expect((await listTemplatesIn(client, 'en', { includeSeriesMembers: true })).some(t => t.id === member)).toBe(false)
    }
    expect((await anon.from('template_series').select('id').eq('id', series)).data).toEqual([])
  })

  it('paginates equal sort orders without duplicates, across template cards and ordered members', async () => {
    await node('t102-pages', null, 't102-pages')
    const added = await pg.query("insert into public.template_series(slug,name_en,name_zh,category_key,is_active,show_members) values('t102-pages','Pages','分页','t102-pages',true,true) returning id")
    const id = added.rows[0].id
    await pg.query(`insert into public.templates(id,name,category_key,series_id,series_sort_order,is_active,fields)
      select 't102-page-'||n,n::text,'t102-pages',$1,32-n,true,'{"images":{"min":1,"max":1},"copy":[],"aspectRatios":["1:1"]}'::jsonb
      from generate_series(1,32) n`, [id])
    const first = await readCategoryEntries(anon, ['t102-pages'], 'en')
    const rest = await readCategoryEntries(anon, ['t102-pages'], 'en', first.nextCursor!)
    const keys = [...first.items, ...rest.items].map(item => item.type === 'template' ? item.template.id : item.series.id)
    expect(first.items).toHaveLength(30)
    expect(new Set(keys).size).toBe(33)
    expect(rest.nextCursor).toBeNull()
    const members = await readSeriesMembers(anon, id, 'en')
    expect(members.items[0].id).toBe('t102-page-32')
    const last = await readSeriesMembers(anon, id, 'en', members.nextCursor!)
    expect(last.items.map(t => t.id)).toEqual(['t102-page-2', 't102-page-1'])
    await pg.query("update public.templates set is_active=false where series_id=$1", [id])
    expect((await readCategoryEntries(service, ['t102-pages'], 'en')).items).toEqual([])
    expect((await anon.from('template_series').select('id').eq('id', id)).data).toEqual([])
  })

  it('revalidates descendants on a cross-root move and atomically moves templates and series on leaf deletion', async () => {
    await pg.query('update public.template_categories set parent_id=$1 where key=$2', ['pets', dark])
    expect((await pg.query('select category,category_key,subcategory_key from public.templates where id=$1', [plain])).rows[0])
      .toEqual({ category: 'Pets', category_key: 'pets', subcategory_key: leaf })
    await pg.query('update public.template_categories set is_visible=false where key=$1', [dark])
    expect((await readCategoryEntries(service, ['pets', 'dark'], 'en')).items).toEqual([])
    await expect(pg.query('select public.admin_delete_template_category($1,$2,$3)', [dark, root, admin])).rejects.toThrow(/CATEGORY_HAS_CHILDREN/)
    await pg.query('update public.template_series set category_key=$1 where id=$2', [leaf, series])
    const deleted = await pg.query('select public.admin_delete_template_category($1,$2,$3) as count', [leaf, root, admin])
    expect(deleted.rows[0].count).toBe(3)
    expect((await pg.query('select category_key,subcategory_key from public.templates where id=$1', [plain])).rows[0])
      .toEqual({ category_key: root, subcategory_key: null })
    expect((await pg.query('select category_key from public.template_series where id=$1', [series])).rows[0].category_key).toBe(root)
  })
})
