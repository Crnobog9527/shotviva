import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { connectAdmin, createUser, retryAuth } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

const api = serviceSupabase()
const root = 't101-food'
const second = 't101-other'
const leaf = 't101-leaf'
const keys = [root, second, leaf, 't101-sub', 't101-test']
const digests = { first: '1'.repeat(64), second: '2'.repeat(64) }
const candidateKeys: string[] = []
let pg: Client
let actor: string
let user: string

function save(key: string, name: string, parent: string | null = null) {
  return api.rpc('admin_save_reference_category', { p_actor: actor, p_key: key, p_name_en: name,
    p_name_zh: name, p_parent: parent, p_is_new: true }).throwOnError()
}

async function upload(sha256: string, category = leaf) {
  const id = randomUUID()
  candidateKeys.push('references/' + id + '.webp')
  await api.rpc('admin_reserve_reference_upload', { p_actor: actor, p_id: id }).throwOnError()
  const { data } = await api.rpc('admin_register_reference_asset', { p_actor: actor, p_asset: {
    id, sha256, category_id: category, bytes: 512, width: 20, height: 30,
  } }).throwOnError()
  return { candidate: id, ...data as { id: string; duplicate: boolean; status: string } }
}

const bulk = (ids: string[], action: string, value: unknown = null, by = actor) =>
  api.rpc('admin_bulk_reference_assets', { p_actor: by, p_ids: ids, p_action: action, p_value: value })
const removeCategory = (id: string, to: string | null) =>
  api.rpc('admin_delete_reference_category', { p_actor: actor, p_key: id, p_move_to: to })

beforeAll(async () => {
  pg = await connectAdmin()
  actor = await createUser(pg)
  user = await createUser(pg)
  await pg.query("update public.profiles set role='admin' where id=$1", [actor])
  await save(root, 'T101 Food')
  await save(second, 'T101 Other')
  await save('t101-sub', 'T101 Sub', root)
  await save(leaf, 'T101 Leaf', 't101-sub')
})

afterAll(async () => {
  await pg.query('delete from public.reference_object_deletions where r2_key=any($1)', [candidateKeys])
  await pg.query('delete from public.reference_assets where created_by=$1', [actor])
  await pg.query('delete from public.template_categories where key=any($1)', [keys])
  await pg.query('delete from auth.users where id=any($1)', [[actor, user]])
  await pg.end()
})

describe('private reference library', () => {
  it('isolates template and reference names, hierarchy and write entry points', async () => {
    const fields = { key: 't101-test', name_en: 'T101 Food', name_zh: 'T101 Food' }
    await api.rpc('admin_save_template_category', { p_actor: actor, p_is_new: true, p_category: fields }).throwOnError()
    const found = await pg.query("select public.template_category_for('T101 Food') as key")
    expect(found.rows[0].key).toBe('t101-test')
    const refused = await api.rpc('admin_save_reference_category', { p_actor: actor, p_key: 't101-test',
      p_name_en: 'T101 Bad', p_name_zh: 'T101 Bad', p_parent: null, p_is_new: false })
    expect(refused.error?.message).toBe('CATEGORY_NOT_FOUND')
    const move = (p_key: string, p_from_parent: string | null, p_parent: string | null) =>
      api.rpc('admin_move_reference_category', { p_actor: actor, p_key, p_from_parent, p_parent, p_before: null })
    expect((await move(second, null, leaf)).error?.message).toBe('INVALID_PARENT')
    expect((await move(root, null, 't101-sub')).error?.message).toBe('INVALID_PARENT')
    expect((await move(second, null, 't101-test')).error?.message).toBe('INVALID_PARENT')
    expect((await removeCategory(root, second)).error?.message).toBe('CATEGORY_HAS_CHILDREN')
    await move(leaf, 't101-sub', root).throwOnError()
    expect((await anonSupabase().from('template_categories').select('key').eq('key', root)).data).toEqual([])
  })

  it('allows private reads and RPCs only to service_role and refuses ordinary or banned actors', async () => {
    const { rows } = await pg.query(`select p.proname from pg_proc p
      where p.pronamespace='public'::regnamespace and p.proname like 'admin%reference%'
      and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute'))`)
    expect(rows).toEqual([])
    const roles = await pg.query(`select role, tbl from unnest(array['anon','authenticated']) role
      cross join unnest(array['reference_assets','reference_template_sources','reference_object_deletions']) tbl
      where has_table_privilege(role,'public.'||tbl,'select,insert,update,delete')`)
    expect(roles.rows).toEqual([])
    expect((await bulk([randomUUID()], 'archive', null, user)).error?.message).toBe('NOT_ADMIN')
    await pg.query("update public.profiles set role='admin', banned_at=now() where id=$1", [user])
    expect((await bulk([randomUUID()], 'archive', null, user)).error?.message).toBe('NOT_ADMIN')
  })

  it('refuses REST reads with both anonymous and signed-in ordinary credentials', async () => {
    const email = 't101-' + randomUUID() + '@example.test'
    const password = randomUUID()
    const signedIn = anonSupabase()
    const profile = await retryAuth(async () => {
      const { data, error } = await api.auth.admin.createUser({ email, password, email_confirm: true })
      if (error || !data.user) throw error ?? new Error('Missing profile')
      return data.user
    })
    try {
      await retryAuth(async () => {
        const { error } = await signedIn.auth.signInWithPassword({ email, password })
        if (error) throw error
      })
      for (const client of [anonSupabase(), signedIn]) {
        for (const table of ['reference_assets', 'reference_template_sources', 'reference_object_deletions']) {
          const denied = await client.from(table).select('*').limit(1)
          expect(denied.error?.code).toBe('42501')
        }
        const { data } = await client.from('template_categories').select('key').eq('key', root).throwOnError()
        expect(data).toEqual([])
      }
    } finally {
      await pg.query('delete from auth.users where id=$1', [profile.id])
    }
  })

  it('serializes duplicate uploads, including archived assets, and keeps only losing keys for cleanup', async () => {
    const uploaded = await Promise.all([upload(digests.first), upload(digests.first)])
    expect(uploaded[0].id).toBe(uploaded[1].id)
    expect(uploaded.map(r => r.duplicate).sort()).toEqual([false, true])
    await bulk([uploaded[0].id], 'archive').throwOnError()
    const archived = await upload(digests.first)
    expect(archived).toMatchObject({ id: uploaded[0].id, status: 'archived', duplicate: true })
    const keys = [uploaded.find(r => r.duplicate)!.candidate, archived.candidate].map(id => 'references/' + id + '.webp')
    const queued = await api.from('reference_object_deletions').select('r2_key').in('r2_key', keys).throwOnError()
    expect(queued.data).toHaveLength(2)
    await api.rpc('admin_ack_reference_deletions', { p_actor: actor, p_keys: keys }).throwOnError()
    await bulk([uploaded[0].id], 'restore').throwOnError()
  })

  it('skips in-flight reservations during cleanup and refuses to register an expired candidate', async () => {
    const id = randomUUID()
    const key = 'references/' + id + '.webp'
    candidateKeys.push(key)
    await api.rpc('admin_reserve_reference_upload', { p_actor: actor, p_id: id }).throwOnError()
    await pg.query("update public.reference_object_deletions set created_at=now()-interval '1 hour' where r2_key=$1", [key])
    await pg.query('begin')
    try {
      await pg.query('select r2_key from public.reference_object_deletions where r2_key=$1 for update', [key])
      const { data } = await api.rpc('admin_due_reference_deletions', { p_actor: actor }).throwOnError()
      expect(data).not.toContainEqual({ r2_key: key })
    } finally {
      await pg.query('rollback')
    }
    const { data } = await api.rpc('admin_due_reference_deletions', { p_actor: actor }).throwOnError()
    expect(data).toContainEqual({ r2_key: key })
    const { error } = await api.rpc('admin_register_reference_asset', { p_actor: actor, p_asset: {
      id, category_id: leaf, sha256: '9'.repeat(64), bytes: 43, width: 1, height: 1,
    } })
    expect(error?.message).toBe('REFERENCE_UPLOAD_EXPIRED')
  })

  it('enforces atomic bulk moves, tags, category deletion, archive, restore and permanent deletion', async () => {
    const first = (await upload(digests.first)).id
    const other = (await upload(digests.second)).id
    const ids = [first, other]
    await bulk(ids, 'add_tags', ['food', 'plate']).throwOnError()
    await bulk(ids, 'add_tags', ['plate']).throwOnError()
    await bulk(ids, 'remove_tags', ['food']).throwOnError()
    expect((await bulk(ids, 'move', 't101-test')).error?.message).toBe('CATEGORY_NOT_FOUND')
    await bulk(ids, 'move', leaf).throwOnError()
    expect((await removeCategory(leaf, null)).error?.message).toBe('CATEGORY_MOVE_REQUIRED')
    expect((await removeCategory(leaf, second).throwOnError()).data).toBe(2)
    await bulk([first], 'archive').throwOnError()
    expect((await bulk(ids, 'delete')).error?.message).toBe('REFERENCE_NOT_ARCHIVED')
    const records = await api.from('reference_assets').select('category_id,tags,reference_template_sources(count)').in('id', ids).throwOnError()
    expect(records.data).toHaveLength(2)
    expect(records.data?.[0]).toMatchObject({ category_id: second, tags: ['plate'], reference_template_sources: [{ count: 0 }] })
    await bulk(ids, 'archive').throwOnError()
    await bulk([first], 'restore').throwOnError()
    await bulk([other], 'delete').throwOnError()
    const key = 'references/' + other + '.webp'
    expect((await api.from('reference_object_deletions').select('r2_key').eq('r2_key', key).single().throwOnError()).data?.r2_key).toBe(key)
    await api.rpc('admin_ack_reference_deletions', { p_actor: actor, p_keys: [key] }).throwOnError()
    const restored = await api.from('reference_assets').select('status,archived_at').eq('id', first).single().throwOnError()
    expect(restored.data).toEqual({ status: 'active', archived_at: null })
  })
})
