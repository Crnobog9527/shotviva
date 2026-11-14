import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deleteTemplateCategory, listAdminCategoryTree, moveTemplateCategory, saveTemplateCategory } from '@/core/admin/template-categories'
import { connectAdmin, createUser } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

const api = serviceSupabase()
let pg: Client
let admin: string
let user: string
const root = 't102b-root'
const second = 't102b-second'
const branch = 't102b-one'
const leaf = 't102b-leaf'
const other = 't102b-two'
const cat = (key: string, extra = {}) => ({
  key, nameEn: key, nameZh: key, introEn: '', introZh: '', cardStyle: 'pair', ...extra,
})
const create = (key: string, parentId: string | null, extra = {}) =>
  saveTemplateCategory(api, admin, { isNew: true, category: cat(key, { parentId, ...extra }) })
const move = (key: string, fromParent: string | null, parentId: string | null, beforeKey: string | null = null) =>
  moveTemplateCategory(api, admin, { key, fromParent, parentId, beforeKey })
const read = async () => (await listAdminCategoryTree(api)).filter(n => n.key.startsWith('t102b-'))

beforeAll(async () => {
  pg = await connectAdmin()
  admin = await createUser(pg)
  user = await createUser(pg)
  await pg.query("update public.profiles set role='admin' where id=$1", [admin])
  await create(root, null)
  await create(second, null)
  await create(branch, root)
  await create(leaf, branch, { slug: 'dish', isVisible: false, seoTitleEn: 'Dish photos' })
  await create(other, root, { slug: 'dish' })
  await pg.query("insert into public.templates(id,name,category_key,subcategory_key) values('t102b-template','Dish',$1,$2)", [root, leaf])
  await pg.query("insert into public.template_series(slug,name_en,name_zh,category_key) values('t102b-set','Set','组',$1)", [leaf])
})

afterAll(async () => {
  await pg.query("delete from public.templates where id='t102b-template'")
  await pg.query("delete from public.template_series where slug='t102b-set'")
  await pg.query("delete from public.template_categories where key like 't102b-%'")
  await pg.query('delete from auth.users where id=any($1)', [[admin, user]])
  await pg.end()
})

describe('category admin tree', () => {
  it('lists hidden nodes, direct assignments and series counts in tree order', async () => {
    const tree = await read()
    expect(tree.map(n => n.key)).toEqual([root, branch, leaf, other, second])
    expect(tree[0].templateCount).toBe(0)
    expect(tree[2]).toMatchObject({ slug: 'dish', parentId: branch, level: 3, isVisible: false,
      templateCount: 1, seriesCount: 1, seoTitleEn: 'Dish photos' })
    const { data } = await anonSupabase().from('template_categories').select('key').eq('key', leaf)
    expect(data).toEqual([])
  })

  it('preserves tree fields on old editor saves and protects the RPC from non-admins', async () => {
    await saveTemplateCategory(api, admin, { isNew: false, category: cat(leaf, { nameZh: '菜品' }) })
    expect((await read()).find(n => n.key === leaf)).toMatchObject({ nameZh: '菜品', parentId: branch, slug: 'dish', isVisible: false, seoTitleEn: 'Dish photos' })
    await expect(moveTemplateCategory(api, user, { key: leaf, fromParent: branch, parentId: second, beforeKey: null })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    const { rows } = await pg.query(`select has_function_privilege(role,
      'public.admin_move_template_category(text,text,text,text,uuid)', 'execute') or has_function_privilege(role,
      'public.admin_assigned_template_count(public.template_categories)','execute') allowed
      from unnest(array['anon','authenticated']) role`)
    expect(rows).toEqual([{ allowed: false }, { allowed: false }])
  })

  it('reorders siblings, rejects invalid parents, and rolls back an invalid anchor atomically', async () => {
    await move(other, root, root, branch)
    expect((await read()).map(n => n.key)).toEqual([root, other, branch, leaf, second])
    for (const attempt of [
      () => move(root, null, leaf), () => move(branch, root, other), () => move(branch, root, second, other),
      () => move(leaf, branch, root), // sibling slug "dish" already exists
    ]) await expect(attempt()).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(deleteTemplateCategory(api, admin, { key: branch, moveTo: second })).rejects.toMatchObject({ message: expect.stringContaining('子分类') })
    expect((await read()).find(n => n.key === leaf)?.parentId).toBe(branch)
  })

  it('handles racing moves from the same parent, refreshing descendant levels and legacy root keys', async () => {
    const attempts = await Promise.allSettled([move(branch, root, second), move(branch, root, null)])
    expect(attempts.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    const parent = (await read()).find(n => n.key === branch)!.parentId
    if (parent !== second) await move(branch, parent, second)
    expect((await read()).find(n => n.key === leaf)?.level).toBe(3)
    const { rows } = await pg.query("select category_key,subcategory_key,category from public.templates where id='t102b-template'")
    expect(rows[0]).toEqual({ category_key: second, subcategory_key: leaf, category: second })
  })

  it('moves a hidden leaf’s template and series into the selected child before deleting', async () => {
    expect(await deleteTemplateCategory(api, admin, { key: leaf, moveTo: other })).toEqual({ moved: 1 })
    const tree = await read()
    expect(tree.find(n => n.key === leaf)).toBeUndefined()
    expect(tree.find(n => n.key === other)).toMatchObject({ seriesCount: 1, templateCount: 1 })
  })
})
