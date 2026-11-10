import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getAdminSeries, listAdminSeriesOptions, saveAdminSeries, searchSeriesCandidates } from '@/core/admin/template-series/repository'
import type { SaveSeriesInput, SeriesFields } from '@/core/admin/template-series/types'
import { readCategoryEntries, readSeriesMembers } from '@/core/templates/taxonomy-reads'
import { connectAdmin, createUser, publishFixture } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

const category = 'series-admin'
const first = 'series-admin-a'
const second = 'series-admin-b'
const fields: SeriesFields = {
  slug: 'series-admin-set', name_en: 'Series', name_zh: '后台测试系列', description_en: 'Description',
  description_zh: '说明', cover_url: 'https://example.test/cover.webp', category_key: category,
  sort_order: 10, is_active: true, show_members: false,
}
const initial: SaveSeriesInput = { id: null, revision: null, fields, members: [first, second], reason: null }
const service = serviceSupabase()
const anon = anonSupabase()
let pg: Client
let actor: string
let user: string

beforeAll(async () => {
  pg = await connectAdmin()
  actor = await createUser(pg)
  user = await createUser(pg)
  await pg.query("update public.profiles set role='admin' where id=$1", [actor])
  await pg.query('insert into public.template_categories(key,name_en,name_zh) values($1,$1,$1)', [category])
  await pg.query(`insert into public.templates(id,name,category_key,fields,cover_after_url,is_active)
    select id,id,$2,'{"images":{"min":1,"max":1},"copy":[],"aspectRatios":["1:1"]}','https://example.test/member.webp',false
    from unnest($1::text[]) id`, [[first, second], category])
  await publishFixture(pg, first, second)
})

afterAll(async () => {
  await pg.query('delete from public.templates where category_key=$1', [category])
  await pg.query('delete from public.template_series where category_key=$1', [category])
  await pg.query('delete from public.template_categories where key=$1', [category])
  await pg.query('delete from auth.users where id=any($1)', [[actor, user]])
  await pg.end()
})

describe('admin series management', () => {
  it('creates, reorders, chooses or clears the cover, changes exposure, unpublishes and detaches', async () => {
    const id = await saveAdminSeries(service, actor, initial)
    let record = (await getAdminSeries(service, id))!
    expect(record.members.map(m => m.id)).toEqual([first, second])
    expect(record).toMatchObject(fields)
    expect((await readCategoryEntries(anon, [category], 'zh')).items.map(x => x.type)).toEqual(['series'])
    const edit = { ...initial, id, revision: record.revision, fields: { ...fields, cover_url: null, show_members: true }, members: [second, first] }
    await saveAdminSeries(service, actor, edit)
    expect((await readSeriesMembers(anon, id, 'zh')).items.map(t => t.id)).toEqual([second, first])
    const entries = (await readCategoryEntries(anon, [category], 'zh')).items
    expect(entries).toHaveLength(3)
    expect(entries.find(x => x.type === 'series')?.series.coverUrl).toEqual('https://example.test/member.webp')
    record = (await getAdminSeries(service, id))!
    const disable = { ...edit, revision: record.revision, fields: { ...edit.fields, is_active: false } }
    await expect(saveAdminSeries(service, actor, disable)).rejects.toThrow('下架原因')
    await saveAdminSeries(service, actor, { ...disable, reason: '测试下架' })
    expect((await readCategoryEntries(anon, [category], 'zh')).items).toEqual([])
    expect(await listAdminSeriesOptions(service)).toContainEqual({ id, nameZh: fields.name_zh })
    record = (await getAdminSeries(service, id))!
    await saveAdminSeries(service, actor, { ...disable, revision: record.revision, members: [] })
    expect((await readCategoryEntries(anon, [category], 'zh')).items).toHaveLength(2)
  })

  it('rejects foreign-owned, system, duplicate or missing members without partial metadata changes', async () => {
    const input = { ...initial, fields: { ...fields, slug: 'series-admin-atomic' }, members: [first] }
    const id = await saveAdminSeries(service, actor, input)
    const snapshot = (await getAdminSeries(service, id))!
    const empty = { ...input, fields: { ...fields, slug: 'series-admin-thief' } }
    await expect(saveAdminSeries(service, actor, empty)).rejects.toThrow('其他系列')
    const write = { ...input, id, revision: snapshot.revision, fields: { ...fields, name_zh: '不可部分保存', slug: input.fields.slug } }
    for (const invalid of [[second, 'series-admin-missing'], ['edit'], [second, second]]) {
      await expect(saveAdminSeries(service, actor, { ...write, members: invalid })).rejects.toThrow()
    }
    expect((await getAdminSeries(service, id))?.revision).toBe(snapshot.revision)
    await saveAdminSeries(service, actor, { ...input, id, revision: snapshot.revision, members: [] })
  })

  it('accepts exactly one of two concurrent saves from the same snapshot', async () => {
    const input = { ...initial, fields: { ...fields, slug: 'series-admin-lock' }, members: [] }
    const id = await saveAdminSeries(service, actor, input)
    const revision = (await getAdminSeries(service, id))!.revision
    const results = await Promise.allSettled([first, second].map(m =>
      saveAdminSeries(service, actor, { ...input, id, revision, members: [m] })))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(r => r.status === 'rejected')?.reason.message).toContain('其他人修改')
  })

  it('pages the admin picker and excludes system templates, irrespective of publication', async () => {
    await pg.query(`insert into public.templates(id,name,category_key,fields,is_active)
      select 'series-admin-page-'||n,'Candidate '||n,$1,'{"images":{"min":1,"max":1},"copy":[],"aspectRatios":["1:1"]}',false
      from generate_series(1,31) n`, [category])
    const page = await searchSeriesCandidates(service, 'series-admin-page-', null)
    expect(page.items).toHaveLength(30)
    const more = await searchSeriesCandidates(service, 'series-admin-page-', page.next)
    expect(more.items).toHaveLength(1)
    expect(more.next).toBeNull()
    expect(new Set([...page.items, ...more.items].map(x => x.id)).size).toBe(31)
    expect((await searchSeriesCandidates(service, 'freeform', null)).items.some(x => x.id === 'freeform')).toBe(false)
  })

  it('allows only the service role and rejects a non-admin actor', async () => {
    const signatures = ['public.admin_save_template_series(uuid,text,jsonb,text[],uuid,text)',
      'public.admin_series_candidates(text,text)', 'public.admin_template_series_detail(uuid)']
    for (const privilege of signatures) {
      const grants = await pg.query(`select has_function_privilege('anon',$1,'execute') as anon,
        has_function_privilege('authenticated',$1,'execute') as signed,has_function_privilege('service_role',$1,'execute') as service`, [privilege])
      expect(grants.rows[0]).toEqual({ anon: false, signed: false, service: true })
    }
    expect((await anon.rpc('admin_series_candidates', { p_search: '', p_after: null })).error).toBeTruthy()
    await expect(saveAdminSeries(service, user, initial)).rejects.toThrow('管理员')
  })
})
