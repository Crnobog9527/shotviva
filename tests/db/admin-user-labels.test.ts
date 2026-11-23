import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { connectAdmin, createUser } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// Migration 1994: one admin-only tag per account on /admin/users; an affiliate's is its admin_label.
const token = randomUUID().slice(0, 8)
const api = serviceSupabase()
const users: string[] = []
let db: Client, actor: string, outsider: string, plain: string, affiliate: string

async function account() {
  const user = await createUser(db)
  users.push(user)
  return user
}

beforeAll(async () => {
  db = await connectAdmin()
  actor = await account()
  outsider = await account()
  plain = await account()
  affiliate = await account()
  await db.query("update profiles set role='admin' where id=$1", [actor])
  await db.query("insert into affiliates(user_id,slug,status) values ($1,$2,'active')", [affiliate, 'tag-' + token])
})

afterAll(async () => {
  if (db) {
    await db.query('delete from auth.users where id=any($1::uuid[])', [users])
    await db.end()
  }
})

const set = (who: string, user: string, label: string | null) => api.rpc('admin_set_user_label', { p_actor: who, p_user: user, p_label: label })

it('is a service-role-only function that only an admin may run, over a table clients cannot read', async () => {
  const privileges = await db.query(`select has_function_privilege('anon',oid,'execute') anon,
    has_function_privilege('authenticated',oid,'execute') authenticated, has_function_privilege('service_role',oid,'execute') service
    from pg_proc where pronamespace='public'::regnamespace and proname='admin_set_user_label'`)
  expect(privileges.rows).toEqual([{ anon: false, authenticated: false, service: true }])
  expect((await anonSupabase().rpc('admin_set_user_label', { p_actor: actor, p_user: plain, p_label: 'x' })).error).not.toBeNull()
  expect((await set(outsider, plain, 'blocked')).error?.message).toBe('NOT_ADMIN')
  const grants = await db.query(`select has_table_privilege(r::name,'public.admin_user_labels','select') readable
    from unnest(array['anon','authenticated']) r`)
  expect(grants.rows.map((r) => r.readable)).toEqual([false, false])
})

it('stores a plain account tag in its own row, trims it, and clears it on blank', async () => {
  expect((await set(actor, plain, '  KOC 小王 ')).data).toBe('KOC 小王')
  expect((await db.query('select label, updated_by from admin_user_labels where user_id=$1', [plain])).rows).toEqual([{ label: 'KOC 小王', updated_by: actor }])
  expect((await set(actor, plain, 'x'.repeat(61))).error?.message).toBe('INVALID_INPUT')
  expect((await set(actor, plain, '  ')).data).toBeNull()
  expect((await db.query('select 1 from admin_user_labels where user_id=$1', [plain])).rowCount).toBe(0)
})

it("writes an affiliate's tag to its admin_label, the value the affiliate admin shows", async () => {
  expect((await set(actor, affiliate, '渠道 A')).data).toBe('渠道 A')
  expect((await db.query('select admin_label from affiliates where user_id=$1', [affiliate])).rows[0].admin_label).toBe('渠道 A')
  expect((await db.query('select 1 from admin_user_labels where user_id=$1', [affiliate])).rowCount).toBe(0)
})

it('refuses an unknown account', async () => {
  expect((await set(actor, randomUUID(), 'ghost')).error?.message).toBe('USER_NOT_FOUND')
})

it('hands a tag set before the account became an affiliate over to its admin_label', async () => {
  const later = await account()
  expect((await set(actor, later, 'KOC 小李')).data).toBe('KOC 小李')
  await db.query("insert into affiliates(user_id,slug,status) values ($1,$2,'pending')", [later, 'late-' + token])
  expect((await db.query('select admin_label from affiliates where user_id=$1', [later])).rows[0].admin_label).toBe('KOC 小李')
  expect((await db.query('select 1 from admin_user_labels where user_id=$1', [later])).rowCount).toBe(0)
})
