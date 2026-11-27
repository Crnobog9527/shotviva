import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { saveFeaturedBundle } from '@/core/admin/featured-bundles'
import { saveHomeCaseStrip } from '@/core/admin/home-case-strip'
import { readHomeCaseStrip } from '@/core/templates/home-case-strip-read'

import { connectAdmin, createUser, publishFixture } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// Migration 2006: 首页「更多真实案例」, written only by admin_set_home_case_strip.
const api = serviceSupabase()
let pg: Client
let admin: string
let user: string
let bundle: string
const live = ['cs-a', 'cs-b', 'cs-c']
const t = (id: string) => ({ kind: 'template' as const, id })
const b = (id: string) => ({ kind: 'bundle' as const, id })
const save = (locale: 'en' | 'zh', entries: object[], actor = admin) => saveHomeCaseStrip(api, actor, { locale, entries })

beforeAll(async () => {
  pg = await connectAdmin()
  admin = await createUser(pg)
  user = await createUser(pg)
  await pg.query("update public.profiles set role='admin' where id=$1", [admin])
  const { rows } = await pg.query<{ key: string }>("select key from public.template_categories where kind='template' and not is_system and parent_id is null order by sort_order limit 1")
  const fields = JSON.stringify({ images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] })
  for (const id of [...live, 'cs-off']) {
    await pg.query(`insert into public.templates(id,name,category_key,fields,quality,credits_cost,is_active,visible_in)
      values($1,$1,$2,$3,'medium','{"1k": 1, "2k": 2, "3k": 3}',false,array['web'])`, [id, rows[0].key, fields])
  }
  await publishFixture(pg, ...live)
  bundle = await saveFeaturedBundle(api, admin, { id: null, nameEn: 'Set', nameZh: '组合', templateIds: ['cs-a', 'cs-b'] })
})

afterAll(async () => {
  await pg.query('delete from public.home_case_strip')
  await pg.query('delete from public.featured_bundles where id=$1', [bundle])
  await pg.query("delete from public.template_sale_approvals where template_id like 'cs-%'")
  await pg.query("delete from public.templates where id like 'cs-%'")
  await pg.query('delete from auth.users where id=any($1)', [[admin, user]])
  await pg.end()
})

describe('首页「更多真实案例」', () => {
  it('saves a language\'s templates and bundles in order, apart from the other language, and replaces it whole', async () => {
    await save('zh', [t('cs-b'), b(bundle), t('cs-a')])
    await save('en', [t('cs-c')])
    expect(await readHomeCaseStrip(api)).toEqual({ zh: [t('cs-b'), b(bundle), t('cs-a')], en: [t('cs-c')] })
    await save('zh', [b(bundle.toUpperCase())])
    expect((await readHomeCaseStrip(api)).zh).toEqual([b(bundle)])
  })

  it('refuses unpublished or missing templates, missing bundles, repeats, nine entries and non-admins, keeping the list', async () => {
    const before = await readHomeCaseStrip(api)
    await expect(save('zh', [t('cs-off')])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(save('zh', [t('cs-none')])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(save('zh', [b('00000000-0000-4000-8000-000000000000')])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(save('zh', [t('cs-a'), t('cs-a')])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(save('zh', [t('cs-a')], user)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    const nine = await api.rpc('admin_set_home_case_strip', { p_locale: 'zh', p_entries: Array.from({ length: 9 }, (_, i) => t(`cs-${i}`)), p_actor: admin })
    expect(nine.error?.message).toBe('CASE_STRIP_SIZE')
    const repeat = await api.rpc('admin_set_home_case_strip', { p_locale: 'zh', p_entries: [t('cs-a'), t('cs-a')], p_actor: admin })
    expect(repeat.error?.message).toBe('INVALID_INPUT')
    expect(await readHomeCaseStrip(api)).toEqual(before)
  })

  it('lets a template and a bundle share an id space, and clears back to the built-in row', async () => {
    await save('en', [t('cs-a'), b(bundle)])
    expect((await readHomeCaseStrip(api)).en).toEqual([t('cs-a'), b(bundle)])
    await save('en', [])
    expect((await readHomeCaseStrip(api)).en).toBeUndefined()
  })

  it('drops a deleted template or bundle from every list', async () => {
    await save('zh', [t('cs-c'), b(bundle), t('cs-a')])
    await pg.query("delete from public.templates where id='cs-c'")
    expect((await readHomeCaseStrip(api)).zh).toEqual([b(bundle), t('cs-a')])
    await pg.query('delete from public.featured_bundles where id=$1', [bundle])
    expect((await readHomeCaseStrip(api)).zh).toEqual([t('cs-a')])
  })

  it('keeps the table and the function away from clients', async () => {
    const read = await anonSupabase().from('home_case_strip').select('*')
    expect(read.data ?? []).toEqual([])
    const rpc = await anonSupabase().rpc('admin_set_home_case_strip', { p_locale: 'zh', p_entries: [], p_actor: admin })
    expect(rpc.error).not.toBeNull()
  })
})
