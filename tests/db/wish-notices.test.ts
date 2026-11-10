import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

let db: Client
let author: string
let voter: string
const excerpt = '春🌷'.repeat(20)

async function enable(value: boolean) {
  await db.query(`insert into public.system_settings (key, value) values ('wishlist_enabled', $1)
    on conflict (key) do update set value = excluded.value`, [JSON.stringify(value)])
}

async function live() {
  const { rows } = await db.query<{ id: string }>(`insert into public.template_requests
    (user_id, description, image_keys, status, author_label, reviewed_at)
    values ($1, $2, array['photo'], 'live', 'T***', now()) returning id`, [author, excerpt + 'end'])
  return rows[0].id
}

const ship = (id: string) => db.query("select public.admin_review_template_request($1, 'shipped', 'freeform')", [id])
const list = async (user: string) => (await db.query('select * from public.list_my_wish_notices($1)', [user])).rows
const mark = (user: string, ids: string[]) => db.query('select public.mark_wish_notices_seen($1, $2)', [user, ids])

beforeAll(async () => { db = await connectAdmin() })
afterAll(async () => { await db.end() })
beforeEach(async () => {
  await db.query('begin')
  author = await createUser(db)
  voter = await createUser(db)
  await enable(true)
  await db.query(`update public.templates set name = 'Flowers', translations = '{"zh":{"name":"鲜花"}}',
    is_active = true, visible_in = array['web'] where id = 'freeform'`)
})
afterEach(async () => { await db.query('rollback') })

it('ships once to the author and current voters, preserving the existing retry conflict', async () => {
  const id = await live()
  const another = await createUser(db)
  const removed = await createUser(db)
  await db.query('insert into public.template_request_votes (request_id, user_id, weight) select $1, u, 1 from unnest($2::uuid[]) u',
    [id, [author, voter, another, removed]])
  await db.query('delete from public.template_request_votes where request_id = $1 and user_id = $2', [id, removed])
  expect(await list(author)).toEqual([])
  await db.query('set local role service_role')
  await ship(id)
  await db.query('savepoint shipped')
  await expect(ship(id)).rejects.toThrow('REQUEST_TRANSITION_INVALID')
  await db.query('rollback to shipped')
  const row = { request_id: id, template_id: 'freeform', template_name_en: 'Flowers', template_name_zh: '鲜花', description_excerpt: excerpt }
  expect(await list(author)).toEqual([{ ...row, is_author: true }])
  for (const user of [voter, another]) expect(await list(user)).toEqual([{ ...row, is_author: false }])
  expect(await list(removed)).toEqual([])
  await mark(removed, [id])
  await mark(voter, [id])
  await mark(voter, [id])
  expect(await list(voter)).toEqual([])
  expect(await list(author)).toHaveLength(1)
})

it('RLS only exposes the signed-in recipient and permits a one-way seen update', async () => {
  const id = await live()
  await db.query('insert into public.template_request_votes (request_id, user_id, weight) values ($1, $2, 1)', [id, voter])
  await ship(id)
  await db.query('set local role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [voter])
  expect((await db.query('select user_id from public.template_request_notices')).rows).toEqual([{ user_id: voter }])
  const update = (user: string) => db.query('update public.template_request_notices set seen_at = now() where user_id = $1', [user])
  expect((await update(author)).rowCount).toBe(0)
  expect((await update(voter)).rowCount).toBe(1)
  expect((await update(voter)).rowCount).toBe(0)
  for (const role of ['anon', 'authenticated']) {
    const { rows } = await db.query(`select
      has_function_privilege($1, 'public.list_my_wish_notices(uuid)', 'execute') as list,
      has_function_privilege($1, 'public.mark_wish_notices_seen(uuid,uuid[])', 'execute') as mark,
      has_table_privilege($1, 'public.template_request_notices', 'insert') as create,
      has_table_privilege($1, 'public.template_request_notices', 'delete') as delete,
      has_column_privilege($1, 'public.template_request_notices', 'user_id', 'update') as reassign`, [role])
    expect(rows[0]).toEqual({ list: false, mark: false, create: false, delete: false, reassign: false })
  }
  await db.query('reset role')
  await db.query('delete from auth.users where id = $1', [voter])
  expect((await db.query('select user_id from public.template_request_notices where request_id = $1', [id])).rows).toEqual([{ user_id: author }])
  await db.query('delete from public.template_requests where id = $1', [id])
  expect(await list(author)).toEqual([])
  expect((await db.query('select 1 from public.template_request_notices where request_id = $1', [id])).rowCount).toBe(0)
})

it('retains unread notices while closed or unpublished, then returns the latest five visible notices', async () => {
  const ids = []
  for (let i = 0; i < 6; i++) {
    const id = await live()
    await ship(id)
    ids.push(id)
  }
  await enable(false)
  await mark(author, ids)
  expect(await list(author)).toEqual([])
  await enable(true)
  await db.query("update public.templates set is_active = false where id = 'freeform'")
  expect(await list(author)).toEqual([])
  await db.query("update public.templates set is_active = true, visible_in = '{}' where id = 'freeform'")
  expect(await list(author)).toEqual([])
  await db.query("update public.templates set visible_in = array['web'], translations = '{}' where id = 'freeform'")
  // All rows were shipped in one transaction, so the request ID breaks the timestamp tie.
  const order = ids.sort().reverse()
  const notices = await list(author)
  expect(notices.map(row => row.request_id)).toEqual(order.slice(0, 5))
  expect(notices[0].template_name_zh).toBe('Flowers')
  await mark(author, [order[0]])
  expect((await list(author)).map(row => row.request_id)).toEqual(order.slice(1))
})

it('exposes both RPCs with the PostgREST response shapes consumed by the app', async () => {
  const service = serviceSupabase()
  const read = await service.rpc('list_my_wish_notices', { p_user_id: author })
  const write = await service.rpc('mark_wish_notices_seen', { p_user_id: author, p_request_ids: [] })
  expect(read).toMatchObject({ error: null, data: [] })
  expect(write).toMatchObject({ error: null, data: null })
})
