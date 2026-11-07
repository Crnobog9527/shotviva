import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deleteTemplateCategory, listAdminCategories, reorderTemplateCategories, saveTemplateCategory, saveTemplate } from '@/core/admin'
import { listTemplatesIn } from '@/core/templates'

import { CREDITS_FLOOR } from '@/modules/image/credits-floor'

import { connectAdmin, createUser } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// T75 (ARCHITECTURE §5 「模板分类由后台管理」): template_categories, the backfill of
// templates.category to keys (0581) and the three admin functions (0582), through the same
// commands the 分类管理 panel calls. Test categories use the `t75-` key prefix.
const service = serviceSupabase()
let db: Client
let admin: string
let user: string

const category = (key: string, nameEn: string, nameZh: string, extra: Record<string, unknown> = {}) => ({
  key,
  nameEn,
  nameZh,
  introEn: '',
  introZh: '',
  cardStyle: 'pair',
  ...extra,
})
const template = (id: string, categoryKey: string) => ({
  id,
  name: id,
  category: categoryKey,
  quality: 'high',
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  visibleIn: ['web'],
  fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] },
  description: 'Test template.',
})
const prompt = { body: 'one', modelParams: {} }
const categoryOf = async (id: string) =>
  (await db.query<{ category: string }>('select category from public.templates where id = $1', [id])).rows[0]?.category
const keys = async () => (await db.query<{ key: string }>('select key from public.template_categories order by sort_order, key')).rows.map((row) => row.key)

beforeAll(async () => {
  db = await connectAdmin()
  admin = await createUser(db)
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
  user = await createUser(db)
})

afterAll(async () => {
  await db.query("delete from public.templates where id like 't75-%'")
  await db.query("delete from public.template_categories where key like 't75-%'")
  await db.end()
})

describe('seeded categories and the backfill', () => {
  it('holds the six categories with names, intros and 画风 as the one drag compare', async () => {
    const all = await listAdminCategories(service)
    const six = all.filter((row) => ['art-styles', 'food-drink', 'products-resale', 'beauty-skincare', 'rooms-spaces', 'pets'].includes(row.key))
    expect(six.map((row) => [row.key, row.nameEn, row.nameZh])).toEqual([
      ['art-styles', 'Art Styles', '画风'],
      ['food-drink', 'Food & Drink', '餐饮'],
      ['products-resale', 'Products & Resale', '商品与二手'],
      ['beauty-skincare', 'Beauty & Skincare', '美妆护肤'],
      ['rooms-spaces', 'Rooms & Spaces', '房间与空间'],
      ['pets', 'Pets', '宠物'],
    ])
    expect(all.filter((row) => row.cardStyle === 'compare').map((row) => row.key)).toEqual(['art-styles'])
    expect(six.every((row) => row.introEn && row.introZh)).toBe(true)
  })

  it('moved the built-in templates onto their own categories', async () => {
    expect(await categoryOf('edit')).toBe('edit')
    expect(await categoryOf('freeform')).toBe('freeform')
    const { rows } = await db.query("select key, name_en, name_zh from public.template_categories where key in ('edit', 'freeform') order by key")
    expect(rows).toEqual([
      { key: 'edit', name_en: 'Photo edit', name_zh: '修图' },
      { key: 'freeform', name_en: 'freeform', name_zh: '自由生成' },
    ])
  })

  // The 0581 backfill, re-run on old-style values inside a transaction that is rolled back:
  // names match by English name (any case, outer spaces) or Chinese name; anything else gets
  // its own category, with a unique slug key.
  it('maps old stored names to keys and gives stray values their own category', async () => {
    const migration = readFileSync(join(process.cwd(), 'supabase', 'migrations', '0581_templates_category_key.sql'), 'utf8')
    const backfill = migration.slice(migration.indexOf('do $$'), migration.indexOf('$$;') + 3)
    const old = [
      ['t75-old-a', 'Food & Drink'],
      ['t75-old-b', ' pets '],
      ['t75-old-c', '宠物'],
      ['t75-old-d', 'Burgers & Fries'],
      ['t75-old-e', '  Burgers & Fries '],
      ['t75-old-f', '早餐'],
    ]
    await db.query('begin')
    try {
      await db.query('alter table public.templates drop constraint templates_category_fkey')
      for (const [id, value] of old) {
        await db.query("insert into public.templates (id, name, category, credits_cost) values ($1, $1, $2, '{\"1k\": 2, \"2k\": 4, \"3k\": 6}')", [id, value])
      }
      await db.query(backfill)
      const { rows } = await db.query<{ id: string; category: string }>("select id, category from public.templates where id like 't75-old-%' order by id")
      expect(rows.map((row) => row.category)).toEqual(['food-drink', 'pets', 'pets', 'burgers-fries', 'burgers-fries', 'category'])
      const strays = await db.query("select key, name_en, name_zh, card_style from public.template_categories where key in ('burgers-fries', 'category') order by key")
      expect(strays.rows).toEqual([
        { key: 'burgers-fries', name_en: 'Burgers & Fries', name_zh: 'Burgers & Fr', card_style: 'pair' },
        { key: 'category', name_en: '早餐', name_zh: '早餐', card_style: 'pair' },
      ])
    } finally {
      await db.query('rollback')
    }
  })

  it('reads each template with its category in the page language', async () => {
    await saveTemplate(service, admin, { isNew: true, template: template('t75-read', 'pets'), prompt }, CREDITS_FLOOR)
    await db.query("update public.templates set is_active = true where id = 't75-read'")
    const zh = (await listTemplatesIn(anonSupabase(), 'zh')).find((row) => row.id === 't75-read')
    expect(zh?.categoryView).toMatchObject({ key: 'pets', name: '宠物', compare: false })
  })
})

describe('admin category functions', () => {
  it('creates a category at the end of the order and edits its names, never its key', async () => {
    await saveTemplateCategory(service, admin, { isNew: true, category: category('t75-kids', 'Kids', '儿童', { introZh: '小朋友。' }) })
    expect((await keys()).at(-1)).toBe('t75-kids')
    await saveTemplateCategory(service, admin, { isNew: false, category: category('t75-kids', 'Kids & Family', '亲子', { cardStyle: 'compare' }) })
    const { rows } = await db.query("select name_en, name_zh, intro_zh, card_style from public.template_categories where key = 't75-kids'")
    expect(rows[0]).toEqual({ name_en: 'Kids & Family', name_zh: '亲子', intro_zh: null, card_style: 'compare' })
  })

  it('refuses a taken key, a taken name in either language, and a non-admin', async () => {
    await expect(saveTemplateCategory(service, admin, { isNew: true, category: category('t75-kids', 'Other', '其他') })).rejects.toMatchObject({ code: 'INVALID_INPUT', message: expect.stringContaining('标识') })
    await expect(saveTemplateCategory(service, admin, { isNew: true, category: category('t75-x', 'pets', '其他') })).rejects.toMatchObject({ message: expect.stringContaining('英文名') })
    await expect(saveTemplateCategory(service, admin, { isNew: true, category: category('t75-x', 'Other', '宠物') })).rejects.toMatchObject({ message: expect.stringContaining('中文名') })
    await expect(saveTemplateCategory(service, user, { isNew: true, category: category('t75-x', 'Other', '其他') })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(saveTemplateCategory(service, admin, { isNew: false, category: category('t75-none', 'None', '无') })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await keys()).not.toContain('t75-x')
  })

  it('reorders only with every category listed once', async () => {
    const before = await keys()
    const reversed = [...before].reverse()
    await reorderTemplateCategories(service, admin, reversed)
    expect(await keys()).toEqual(reversed)
    await expect(reorderTemplateCategories(service, admin, reversed.slice(1))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await reorderTemplateCategories(service, admin, before)
    expect(await keys()).toEqual(before)
  })

  it('deletes an unused category at once', async () => {
    await saveTemplateCategory(service, admin, { isNew: true, category: category('t75-empty', 'Empty', '空分类') })
    expect(await deleteTemplateCategory(service, admin, { key: 't75-empty', moveTo: null })).toEqual({ moved: 0 })
    expect(await keys()).not.toContain('t75-empty')
  })

  it('moves every template of a category in use, published or not, then deletes it', async () => {
    await saveTemplateCategory(service, admin, { isNew: true, category: category('t75-old', 'Old', '旧分类') })
    await saveTemplate(service, admin, { isNew: true, template: template('t75-live', 't75-old'), prompt }, CREDITS_FLOOR)
    await saveTemplate(service, admin, { isNew: true, template: template('t75-draft', 't75-old'), prompt }, CREDITS_FLOOR)
    await db.query("update public.templates set is_active = true where id = 't75-live'")
    const listed = (await listAdminCategories(service)).find((row) => row.key === 't75-old')
    expect(listed?.templateCount).toBe(2)

    await expect(deleteTemplateCategory(service, admin, { key: 't75-old', moveTo: null })).rejects.toMatchObject({ message: expect.stringContaining('先选') })
    await expect(deleteTemplateCategory(service, admin, { key: 't75-old', moveTo: 't75-gone' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await categoryOf('t75-live')).toBe('t75-old')

    expect(await deleteTemplateCategory(service, admin, { key: 't75-old', moveTo: 't75-kids' })).toEqual({ moved: 2 })
    expect([await categoryOf('t75-live'), await categoryOf('t75-draft')]).toEqual(['t75-kids', 't75-kids'])
    expect(await keys()).not.toContain('t75-old')
  })

  it('keeps the last category', async () => {
    // Alone inside a rolled-back transaction: every template on one category, the rest gone.
    await db.query('begin')
    try {
      await db.query("update public.templates set category = 'pets' where category <> 'pets'")
      await db.query("delete from public.template_categories where key <> 'pets'")
      await expect(db.query('select public.admin_delete_template_category($1, null, $2)', ['pets', admin])).rejects.toThrow(/CATEGORY_LAST/)
    } finally {
      await db.query('rollback')
    }
  })

  it('refuses a template saved on a category that does not exist', async () => {
    await expect(saveTemplate(service, admin, { isNew: true, template: template('t75-orphan', 't75-gone'), prompt }, CREDITS_FLOOR)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('lets visitors read categories but never write them or call the functions', async () => {
    const anon = anonSupabase()
    const { data } = await anon.from('template_categories').select('key, name_zh').eq('key', 'pets')
    expect(data).toEqual([{ key: 'pets', name_zh: '宠物' }])
    const { error: insertError } = await anon.from('template_categories').insert({ key: 't75-anon', name_en: 'Anon', name_zh: '匿名' })
    expect(insertError).not.toBeNull()
    for (const fn of ['admin_save_template_category(jsonb, boolean, uuid)', 'admin_reorder_template_categories(text[], uuid)', 'admin_delete_template_category(text, text, uuid)']) {
      const { rows } = await db.query<{ allowed: boolean }>(`select has_function_privilege('anon', 'public.${fn}', 'execute') or has_function_privilege('authenticated', 'public.${fn}', 'execute') as allowed`)
      expect(rows[0]?.allowed, fn).toBe(false)
    }
  })
})
