import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { saveHomeHero } from '@/core/admin/home-hero'
import { heroScenesFor } from '@/core/templates/home-hero'
import { readHomeHero } from '@/core/templates/home-hero-read'

import { connectAdmin, createUser, publishFixture } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// Migration 2007: 首页首屏大图, written only by admin_set_home_hero.
const api = serviceSupabase()
let pg: Client
let admin: string
let user: string
const live = ['hh-a', 'hh-b', 'hh-c']
const s = (templateId: string, caption: string | null = null) => ({ templateId, caption })
const save = (scope: string, entries: object[], actor = admin) => saveHomeHero(api, actor, { scope, entries })

beforeAll(async () => {
  pg = await connectAdmin()
  admin = await createUser(pg)
  user = await createUser(pg)
  await pg.query("update public.profiles set role='admin' where id=$1", [admin])
  const { rows } = await pg.query<{ key: string }>("select key from public.template_categories where kind='template' and not is_system and parent_id is null order by sort_order limit 1")
  const fields = JSON.stringify({ images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] })
  for (const id of [...live, 'hh-off', ...Array.from({ length: 4 }, (_, i) => `hh-x${i}`)]) {
    await pg.query(`insert into public.templates(id,name,category_key,fields,quality,credits_cost,is_active,visible_in)
      values($1,$1,$2,$3,'medium','{"1k": 1, "2k": 2, "3k": 3}',false,array['web'])`, [id, rows[0].key, fields])
  }
  await publishFixture(pg, ...live, ...Array.from({ length: 4 }, (_, i) => `hh-x${i}`))
})

afterAll(async () => {
  await pg.query("delete from public.home_hero_scenes where template_id like 'hh-%'")
  await pg.query("delete from public.template_sale_approvals where template_id like 'hh-%'")
  await pg.query("delete from public.templates where id like 'hh-%'")
  await pg.query('delete from auth.users where id=any($1)', [[admin, user]])
  await pg.end()
})

describe('首页首屏大图', () => {
  it('saves the default and a language apart, in order with captions, and a language follows the default until it has its own', async () => {
    await save('default', [s('hh-b', '  Same plate  '), s('hh-a', ' ')])
    let settings = await readHomeHero(api)
    expect(settings.default).toEqual([s('hh-b', 'Same plate'), s('hh-a')])
    expect(heroScenesFor(settings, 'zh')).toEqual(settings.default)
    await save('zh', [s('hh-c')])
    settings = await readHomeHero(api)
    expect(heroScenesFor(settings, 'zh')).toEqual([s('hh-c')])
    expect(heroScenesFor(settings, 'en')).toEqual(settings.default)
  })

  it('refuses unknown scopes, unpublished or repeated templates, seven scenes, long captions and non-admins, keeping the list', async () => {
    const before = await readHomeHero(api)
    await expect(save('xx', [s('hh-a')])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(save('zh', [s('hh-off')])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(save('zh', [s('hh-a'), s('hh-a')])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(save('zh', [s('hh-a', 'x'.repeat(61))])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(save('zh', [s('hh-a')], user)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    const seven = await api.rpc('admin_set_home_hero', { p_scope: 'zh', p_entries: [...live, 'hh-x0', 'hh-x1', 'hh-x2', 'hh-x3'].map((id) => s(id)), p_actor: admin })
    expect(seven.error?.message).toBe('HERO_SIZE')
    const shape = await api.rpc('admin_set_home_hero', { p_scope: 'Not a tag', p_entries: [], p_actor: admin })
    expect(shape.error?.message).toBe('INVALID_INPUT')
    expect(await readHomeHero(api)).toEqual(before)
  })

  it('accepts any language tag in the database, so a new site language needs no migration', async () => {
    const rpc = await api.rpc('admin_set_home_hero', { p_scope: 'fr', p_entries: [s('hh-a')], p_actor: admin })
    expect(rpc.error).toBeNull()
    // The app only reads the languages the site has.
    expect(Object.keys(await readHomeHero(api))).not.toContain('fr')
    await api.rpc('admin_set_home_hero', { p_scope: 'fr', p_entries: [], p_actor: admin })
  })

  it('clears a language back to the default, and drops a deleted template', async () => {
    await save('zh', [])
    expect((await readHomeHero(api)).zh).toBeUndefined()
    await pg.query("delete from public.templates where id='hh-b'")
    expect((await readHomeHero(api)).default).toEqual([s('hh-a')])
  })

  it('keeps the table and the function away from clients', async () => {
    const read = await anonSupabase().from('home_hero_scenes').select('*')
    expect(read.data ?? []).toEqual([])
    const rpc = await anonSupabase().rpc('admin_set_home_hero', { p_scope: 'default', p_entries: [], p_actor: admin })
    expect(rpc.error).not.toBeNull()
  })
})
