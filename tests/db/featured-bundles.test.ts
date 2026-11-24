import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deleteFeaturedBundle, saveFeaturedBundle, setDefaultFeaturedBundles } from '@/core/admin/featured-bundles'
import { saveLocaleDisplay } from '@/core/admin/locale-display'
import { localeBundles } from '@/core/templates/locale-display'
import { readLocaleDisplay } from '@/core/templates/locale-display-read'

import { connectAdmin, createUser, publishFixture } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// Migrations 2004 and 2005: 精选组合, written only by the admin functions.
const api = serviceSupabase()
let pg: Client
let admin: string
let user: string
const live = ['fb-a', 'fb-b', 'fb-c']
const save = (input: object, actor = admin) => saveFeaturedBundle(api, actor, { id: null, nameEn: 'Set', nameZh: '组合', templateIds: ['fb-a', 'fb-b'], ...input })
const ours = async () => ((await readLocaleDisplay(api)).bundles?.list ?? []).filter((bundle) => bundle.templateIds.some((id) => id.startsWith('fb-')))

beforeAll(async () => {
  pg = await connectAdmin()
  admin = await createUser(pg)
  user = await createUser(pg)
  await pg.query("update public.profiles set role='admin' where id=$1", [admin])
  const { rows } = await pg.query<{ key: string }>("select key from public.template_categories where kind='template' and not is_system and parent_id is null order by sort_order limit 1")
  const fields = JSON.stringify({ images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] })
  for (const id of [...live, 'fb-off']) {
    await pg.query(`insert into public.templates(id,name,category_key,fields,quality,credits_cost,is_active,visible_in)
      values($1,$1,$2,$3,'medium','{"1k": 1, "2k": 2, "3k": 3}',false,array['web'])`, [id, rows[0].key, fields])
  }
  await publishFixture(pg, ...live)
})

afterAll(async () => {
  await pg.query("delete from public.featured_bundles where id in (select bundle_id from public.featured_bundle_items where template_id like 'fb-%')")
  await pg.query("delete from public.template_featured_locale where template_id like 'fb-%'")
  await pg.query("delete from public.template_sale_approvals where template_id like 'fb-%'")
  await pg.query("delete from public.templates where id like 'fb-%'")
  await pg.query('delete from auth.users where id=any($1)', [[admin, user]])
  await pg.end()
})

describe('精选组合', () => {
  it('saves a bundle with its templates in order, and edits it in place', async () => {
    const id = await save({ templateIds: ['fb-b', 'fb-a'] })
    expect((await ours()).find((bundle) => bundle.id === id)).toMatchObject({ nameEn: 'Set', nameZh: '组合', templateIds: ['fb-b', 'fb-a'], featuredRank: null })
    expect(await save({ id, nameEn: 'Brunch', templateIds: ['fb-c', 'fb-a', 'fb-b'] })).toBe(id)
    expect((await ours()).find((bundle) => bundle.id === id)).toMatchObject({ nameEn: 'Brunch', templateIds: ['fb-c', 'fb-a', 'fb-b'] })
    await deleteFeaturedBundle(api, admin, id)
  })

  it('refuses too few or repeated templates, unpublished ones, missing names and non-admins, keeping nothing', async () => {
    const before = await ours()
    await expect(save({ templateIds: ['fb-a'] })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(save({ templateIds: ['fb-a', 'fb-a'] })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(save({ templateIds: ['fb-a', 'fb-off'] })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(save({ nameZh: ' ' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(save({}, user)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    const nine = await api.rpc('admin_save_featured_bundle', { p_id: null, p_name_en: 'x', p_name_zh: 'x', p_template_ids: Array.from({ length: 9 }, (_, i) => `fb-${i}`), p_actor: admin })
    expect(nine.error?.message).toBe('BUNDLE_SIZE')
    expect(await ours()).toEqual(before)
  })

  it('places bundles in the default 首页精选 in order, which a following language shows', async () => {
    const first = await save({ nameEn: 'First' })
    const second = await save({ nameEn: 'Second', templateIds: ['fb-b', 'fb-c'] })
    await setDefaultFeaturedBundles(api, admin, [second, first])
    const display = await readLocaleDisplay(api)
    expect(localeBundles(display, 'en').map((bundle) => bundle.id).filter((id) => [first, second].includes(id))).toEqual([second, first])
    await setDefaultFeaturedBundles(api, admin, [first])
    expect((await ours()).find((bundle) => bundle.id === second)?.featuredRank).toBeNull()
    await expect(setDefaultFeaturedBundles(api, user, [first])).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('gives a language its own bundles, all or nothing with the rest of its draft', async () => {
    const [bundle] = await ours()
    await saveLocaleDisplay(api, admin, { locale: 'zh', groups: [], featured: ['fb-a'], bundles: [bundle.id] })
    expect((await readLocaleDisplay(api)).bundles?.locale.zh).toEqual([bundle.id])
    expect(localeBundles(await readLocaleDisplay(api), 'zh').map((one) => one.id)).toEqual([bundle.id])
    const missing = '00000000-0000-4000-8000-000000000000'
    await expect(saveLocaleDisplay(api, admin, { locale: 'zh', groups: [], featured: ['fb-b'], bundles: [missing] })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const after = await readLocaleDisplay(api)
    expect(after.featured.zh).toEqual(['fb-a'])
    expect(after.bundles?.locale.zh).toEqual([bundle.id])
  })

  it('keeps a language\'s bundles when only its templates change, and follows the default again when emptied', async () => {
    await saveLocaleDisplay(api, admin, { locale: 'zh', groups: [], featured: [] })
    expect((await readLocaleDisplay(api)).bundles?.locale.zh?.length).toBe(1)
    await saveLocaleDisplay(api, admin, { locale: 'zh', groups: [], featured: null, bundles: [] })
    expect((await readLocaleDisplay(api)).bundles?.locale.zh ?? []).toEqual([])
  })

  it('leaves a deleted template out of its bundles, and a deleted bundle out of every list', async () => {
    const id = await save({ templateIds: ['fb-a', 'fb-b', 'fb-c'] })
    await pg.query("delete from public.templates where id='fb-c'")
    expect((await ours()).find((bundle) => bundle.id === id)?.templateIds).toEqual(['fb-a', 'fb-b'])
    await deleteFeaturedBundle(api, admin, id)
    await expect(deleteFeaturedBundle(api, admin, id)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('keeps the tables and functions away from clients', async () => {
    for (const table of ['featured_bundles', 'featured_bundle_items', 'bundle_featured_locale']) {
      const read = await anonSupabase().from(table).select('*')
      expect(read.data ?? []).toEqual([])
    }
    const rpc = await anonSupabase().rpc('admin_save_featured_bundle', { p_id: null, p_name_en: 'x', p_name_zh: 'x', p_template_ids: ['fb-a', 'fb-b'], p_actor: admin })
    expect(rpc.error).not.toBeNull()
  })
})
