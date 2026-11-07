
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deleteTemplateCategory, listAdminCategories, reorderTemplateCategories, saveTemplateCategory, saveTemplate } from '@/core/admin'
import { listTemplatesIn } from '@/core/templates'

import { CREDITS_FLOOR } from '@/modules/image/credits-floor'

import { connectAdmin, createUser } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// T75 (ARCHITECTURE §5 「模板分类由后台管理」): template_categories (0580), templates.category_key
// with its sync triggers next to the old templates.category name (0581, expand only), the three
// admin functions (0582) and admin_upsert_template's category_key (0583), through the same
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
  (await db.query<{ category_key: string }>('select category_key from public.templates where id = $1', [id])).rows[0]?.category_key
const nameOf = async (id: string) =>
  (await db.query<{ category: string }>('select category from public.templates where id = $1', [id])).rows[0]?.category
const keys = async () =>
  (await db.query<{ key: string }>('select key from public.template_categories where not is_system order by sort_order, key')).rows.map((row) => row.key)

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
    const all = (await listAdminCategories(service)).filter((row) => !row.isSystem)
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

  it('keeps the built-in templates on their own system categories, names unchanged', async () => {
    expect([await categoryOf('edit'), await nameOf('edit')]).toEqual(['edit', 'edit'])
    expect([await categoryOf('freeform'), await nameOf('freeform')]).toEqual(['freeform', 'freeform'])
    const { rows } = await db.query("select key, name_en, name_zh, is_system from public.template_categories where key in ('edit', 'freeform') order by key")
    expect(rows).toEqual([
      { key: 'edit', name_en: 'edit', name_zh: '修图', is_system: true },
      { key: 'freeform', name_en: 'freeform', name_zh: '自由生成', is_system: true },
    ])
  })

  // The 0581 backfill and trigger use one lookup (template_category_for): a write that sets
  // only templates.category (the old build, the import) gets its key; names match by English
  // name (any case, outer spaces) or Chinese name; anything else gets its own category, with a
  // unique slug key and names numbered until unique. Inside a rolled-back transaction.
  it('finds or creates the key for a written name, keeping templates.category the English name', async () => {
    const old = [
      ['t75-old-a', 'Food & Drink'],
      ['t75-old-b', ' pets '],
      ['t75-old-c', '宠物'],
      ['t75-old-d', 'Burgers & Fries'],
      ['t75-old-e', '  Burgers & Fries '],
      ['t75-old-f', 'Burgers & Friends'],
      ['t75-old-g', '早餐'],
      ['t75-old-h', 'products'],
    ]
    await db.query('begin')
    try {
      for (const [id, value] of old) {
        await db.query("insert into public.templates (id, name, category, credits_cost) values ($1, $1, $2, '{\"1k\": 2, \"2k\": 4, \"3k\": 6}')", [id, value])
      }
      const { rows } = await db.query<{ category_key: string; category: string }>(
        "select category_key, category from public.templates where id like 't75-old-%' order by id",
      )
      expect(rows.map((row) => row.category_key)).toEqual(['food-drink', 'pets', 'pets', 'burgers-fries', 'burgers-fries', 'burgers-friends', 'category', 'products'])
      expect(rows.map((row) => row.category)).toEqual(['Food & Drink', 'Pets', 'Pets', 'Burgers & Fries', 'Burgers & Fries', 'Burgers & Friends', '早餐', 'products'])
      const created = await db.query(
        "select key, name_en, name_zh, card_style, is_system from public.template_categories where key in ('burgers-fries', 'burgers-friends', 'category', 'products') order by key",
      )
      expect(created.rows).toEqual([
        { key: 'burgers-fries', name_en: 'Burgers & Fries', name_zh: 'Burgers & Fr', card_style: 'pair', is_system: false },
        // Its Chinese name cut to 12 collides with the one above: numbered.
        { key: 'burgers-friends', name_en: 'Burgers & Friends', name_zh: 'Burgers & 2', card_style: 'pair', is_system: false },
        { key: 'category', name_en: '早餐', name_zh: '早餐', card_style: 'pair', is_system: false },
        { key: 'products', name_en: 'products', name_zh: 'products', card_style: 'pair', is_system: false },
      ])
    } finally {
      await db.query('rollback')
    }
  })

  // What the build live before T75 sends: only `category`, as a name.
  it('saves an old-style admin payload through admin_upsert_template', async () => {
    await db.query('begin')
    try {
      await db.query(
        `select public.admin_upsert_template($1::jsonb, null)`,
        [JSON.stringify({ id: 't75-legacy', name: 'Legacy', category: 'Rooms & Spaces', credits_cost: { '1k': 2, '2k': 4, '3k': 6 } })],
      )
      expect([await categoryOf('t75-legacy'), await nameOf('t75-legacy')]).toEqual(['rooms-spaces', 'Rooms & Spaces'])
      await db.query(`select public.admin_upsert_template($1::jsonb, null)`, [
        JSON.stringify({ id: 't75-legacy', name: 'Legacy', category: 'Art Styles', credits_cost: { '1k': 2, '2k': 4, '3k': 6 } }),
      ])
      expect([await categoryOf('t75-legacy'), await nameOf('t75-legacy')]).toEqual(['art-styles', 'Art Styles'])
    } finally {
      await db.query('rollback')
    }
  })

  it('reads each template with its category in the page language', async () => {
    await saveTemplate(service, admin, { isNew: true, template: template('t75-read', 'pets'), prompt }, CREDITS_FLOOR)
    await db.query("update public.templates set is_active = true where id = 't75-read'")
    const zh = (await listTemplatesIn(anonSupabase(), 'zh')).find((row) => row.id === 't75-read')
    expect(zh?.categoryView).toMatchObject({ key: 'pets', name: '宠物', compare: false })
    expect(await nameOf('t75-read')).toBe('Pets')
  })

  it('never lists a template in a system category on the site', async () => {
    await saveTemplate(service, admin, { isNew: true, template: template('t75-system', 'freeform'), prompt }, CREDITS_FLOOR)
    await db.query("update public.templates set is_active = true where id = 't75-system'")
    expect((await listTemplatesIn(anonSupabase(), 'en')).some((row) => row.id === 't75-system')).toBe(false)
  })
})

describe('admin category functions', () => {
  it('creates a category at the end of the order and edits its names, never its key', async () => {
    await saveTemplateCategory(service, admin, { isNew: true, category: category('t75-kids', 'Kids', '儿童', { introZh: '小朋友。' }) })
    expect((await keys()).at(-1)).toBe('t75-kids')
    await saveTemplate(service, admin, { isNew: true, template: template('t75-kid', 't75-kids'), prompt }, CREDITS_FLOOR)
    expect(await nameOf('t75-kid')).toBe('Kids')
    await saveTemplateCategory(service, admin, { isNew: false, category: category('t75-kids', 'Kids & Family', '亲子', { cardStyle: 'compare' }) })
    const { rows } = await db.query("select name_en, name_zh, intro_zh, card_style from public.template_categories where key = 't75-kids'")
    expect(rows[0]).toEqual({ name_en: 'Kids & Family', name_zh: '亲子', intro_zh: null, card_style: 'compare' })
    // The rename reaches templates.category; the key stays.
    expect([await categoryOf('t75-kid'), await nameOf('t75-kid')]).toEqual(['t75-kids', 'Kids & Family'])
  })

  it('locks the system categories', async () => {
    await expect(saveTemplateCategory(service, admin, { isNew: false, category: category('edit', 'Edit', '编辑') })).rejects.toMatchObject({ message: expect.stringContaining('系统分类') })
    await expect(deleteTemplateCategory(service, admin, { key: 'freeform', moveTo: 'pets' })).rejects.toMatchObject({ message: expect.stringContaining('系统分类') })
    await expect(deleteTemplateCategory(service, admin, { key: 'pets', moveTo: 'edit' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await keys()).toContain('pets')
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
    expect([await nameOf('t75-live'), await nameOf('t75-draft')]).toEqual(['Kids & Family', 'Kids & Family'])
    expect(await keys()).not.toContain('t75-old')
  })

  it('keeps the last category', async () => {
    // Alone inside a rolled-back transaction: every template on one category, the rest gone.
    await db.query('begin')
    try {
      await db.query("update public.templates set category_key = 'pets' where category_key <> 'pets' and category_key not in ('edit', 'freeform')")
      await db.query("delete from public.template_categories where key <> 'pets' and not is_system")
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
