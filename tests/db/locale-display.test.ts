import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { setLocaleCategoryOrder, setLocaleFeatured } from '@/core/admin/locale-display'
import { saveTemplateCategory } from '@/core/admin/template-categories'
import { readLocaleDisplay } from '@/core/templates/locale-display-read'

import { connectAdmin, createUser, publishFixture } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// Migration 1575: each language's own category order and featured list, written only by the
// admin functions and read back by the public pages through the service role.
const api = serviceSupabase()
let pg: Client
let admin: string
let user: string
const [first, second, third, child] = ['ld-first', 'ld-second', 'ld-third', 'ld-child']
const cat = (key: string, parentId: string | null) => ({ key, nameEn: key, nameZh: key, introEn: '', introZh: '', cardStyle: 'pair', parentId })
const order = (locale: string, parent: string | null, keys: string[], actor = admin) => setLocaleCategoryOrder(api, actor, { locale, parent, keys })
const roots = [first, second, third]

beforeAll(async () => {
  pg = await connectAdmin()
  admin = await createUser(pg)
  user = await createUser(pg)
  await pg.query("update public.profiles set role='admin' where id=$1", [admin])
  for (const key of roots) await saveTemplateCategory(api, admin, { isNew: true, category: cat(key, null) })
  await saveTemplateCategory(api, admin, { isNew: true, category: cat(child, first) })
  const fields = JSON.stringify({ images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] })
  for (const id of ['ld-live-a', 'ld-live-b', 'ld-off']) {
    await pg.query(`insert into public.templates(id,name,category_key,fields,quality,credits_cost,is_active,visible_in)
      values($1,$1,$2,$3,'medium','{"1k": 1, "2k": 2, "3k": 3}',false,array['web'])`, [id, first, fields])
  }
  await publishFixture(pg, 'ld-live-a', 'ld-live-b')
})

afterAll(async () => {
  await pg.query("delete from public.template_featured_locale where template_id like 'ld-%'")
  await pg.query("delete from public.template_sale_approvals where template_id like 'ld-%'")
  await pg.query("delete from public.templates where id like 'ld-%'")
  await pg.query("delete from public.template_categories where key like 'ld-%'")
  await pg.query('delete from auth.users where id=any($1)', [[admin, user]])
  await pg.end()
})

// The test database may hold other categories at the top level; only ours are compared.
const saved = async (locale: 'en' | 'zh') => {
  const own = (await readLocaleDisplay(api)).categoryOrder[locale] ?? {}
  return Object.entries(own).filter(([key]) => key.startsWith('ld-')).sort((a, b) => a[1] - b[1]).map(([key]) => key)
}

describe('per-language category order', () => {
  it('starts with nothing saved, so every language follows the shared order', async () => {
    expect(await saved('en')).toEqual([])
    expect(await saved('zh')).toEqual([])
  })

  it('saves one language without touching the other or the shared order', async () => {
    const before = (await pg.query("select key,sort_order from public.template_categories where key like 'ld-%' order by key")).rows
    await order('zh', null, await siblings(null, [third, first, second]))
    expect(await saved('zh')).toEqual([third, first, second])
    expect(await saved('en')).toEqual([])
    const after = (await pg.query("select key,sort_order from public.template_categories where key like 'ld-%' order by key")).rows
    expect(after).toEqual(before)
  })

  it('saves a nested sibling group on its own', async () => {
    await order('en', first, [child])
    expect(await saved('en')).toEqual([child])
  })

  it('goes back to following the shared order when the group is cleared', async () => {
    await order('zh', null, [])
    expect(await saved('zh')).toEqual([])
  })

  it('refuses a group that is not the current set of siblings, and keeps the old order', async () => {
    await order('zh', null, await siblings(null, [second, first, third]))
    await expect(order('zh', null, [first, second])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await saved('zh')).toEqual([second, first, third])
  })

  it('refuses non-admins and unknown languages, and keeps the tables away from clients', async () => {
    await expect(order('en', null, roots, user)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(order('fr', null, roots)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const rpc = await anonSupabase().rpc('admin_set_category_locale_order', { p_locale: 'en', p_parent: null, p_keys: [], p_actor: admin })
    expect(rpc.error).not.toBeNull()
    const read = await anonSupabase().from('template_category_locale_order').select('category_key')
    expect(read.data ?? []).toEqual([])
  })
})

// The group is the live top level; ours go first in the given order, the rest keep theirs.
async function siblings(parent: string | null, ours: string[]) {
  const { rows } = await pg.query<{ key: string }>(
    "select key from public.template_categories where kind='template' and not is_system and parent_id is not distinct from $1 and key not like 'ld-%' order by sort_order,key", [parent])
  return [...ours, ...rows.map((row) => row.key)]
}

describe('per-language featured list', () => {
  const featured = async (locale: 'en' | 'zh') => (await readLocaleDisplay(api)).featured[locale] ?? []

  it('saves a whole list per language, in order', async () => {
    await setLocaleFeatured(api, admin, { locale: 'zh', ids: ['ld-live-b', 'ld-live-a'] })
    expect(await featured('zh')).toEqual(['ld-live-b', 'ld-live-a'])
    expect(await featured('en')).toEqual([])
    await setLocaleFeatured(api, admin, { locale: 'zh', ids: ['ld-live-a'] })
    expect(await featured('zh')).toEqual(['ld-live-a'])
  })

  it('leaves the shared featured rank alone', async () => {
    const { rows } = await pg.query("select count(*)::int as n from public.templates where id like 'ld-%' and featured_rank is not null")
    expect(rows[0].n).toBe(0)
  })

  it('refuses unpublished or unknown templates, duplicates and non-admins', async () => {
    for (const ids of [['ld-off'], ['ld-missing'], ['ld-live-a', 'ld-live-a']]) {
      await expect(setLocaleFeatured(api, admin, { locale: 'zh', ids })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    }
    await expect(setLocaleFeatured(api, user, { locale: 'zh', ids: ['ld-live-a'] })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(await featured('zh')).toEqual(['ld-live-a'])
  })

  it('clears to following the shared list, and drops a deleted template from the list', async () => {
    await setLocaleFeatured(api, admin, { locale: 'en', ids: ['ld-live-b'] })
    await pg.query("delete from public.templates where id='ld-live-b'")
    expect(await featured('en')).toEqual([])
    await setLocaleFeatured(api, admin, { locale: 'zh', ids: [] })
    expect(await featured('zh')).toEqual([])
  })
})
