import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { dossier, dossiers } from '@/core/affiliate/admin/dossier-read'
import { connectAdmin, createUser } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

const token = randomUUID().slice(0, 8)
const api = serviceSupabase()
const users: string[] = []
let db: Client, actor: string, outsider: string, banned: string, member: string, pending: string

async function account() {
  const user = await createUser(db)
  users.push(user)
  return user
}

beforeAll(async () => {
  db = await connectAdmin()
  actor = await account()
  outsider = await account()
  banned = await account()
  member = await account()
  pending = await account()
  await db.query("update profiles set role='admin' where id=any($1::uuid[])", [[actor, banned]])
  await db.query('update profiles set banned_at=now() where id=$1', [banned])
  await db.query("insert into affiliates(user_id,slug,status) values ($1,$2,'active'),($3,$4,'pending')",
    [member, 'label-' + token, pending, 'wait-' + token])
})

afterAll(async () => {
  if (db) {
    await db.query('delete from auth.users where id=any($1::uuid[])', [users])
    await db.end()
  }
})

const annotate = (who: string, input: Record<string, unknown>) =>
  api.rpc('admin_affiliate_annotate', { p_actor: who, p_input: { user_id: member, ...input } })

it('lets only a current unbanned admin write the label, through a service-role-only function', async () => {
  const privileges = await db.query(`select has_function_privilege('anon',oid,'execute') anon,
    has_function_privilege('authenticated',oid,'execute') authenticated, has_function_privilege('service_role',oid,'execute') service
    from pg_proc where pronamespace='public'::regnamespace and proname='admin_affiliate_annotate'`)
  expect(privileges.rows).toEqual([{ anon: false, authenticated: false, service: true }])
  expect((await anonSupabase().rpc('admin_affiliate_annotate', { p_actor: actor, p_input: { user_id: member, admin_label: 'x' } })).error).not.toBeNull()
  for (const who of [outsider, banned]) {
    expect((await annotate(who, { admin_label: 'blocked' })).error?.message).toBe('NOT_ADMIN')
  }
  const { rows } = await db.query('select admin_label from affiliates where user_id=$1', [member])
  expect(rows[0].admin_label).toBeNull()
})

it('keeps the label column out of reach of clients', async () => {
  const grants = await db.query(`select has_column_privilege(role_name::name,'public.affiliates','admin_label','select') readable
    from unnest(array['anon','authenticated']) role_name`)
  expect(grants.rows.map((r) => r.readable)).toEqual([false, false])
  const { rows } = await db.query("select relrowsecurity from pg_class where oid='public.affiliates'::regclass")
  expect(rows[0].relrowsecurity).toBe(true)
})

it('shows the label in the directory and dossier, searches by it, and clears it', async () => {
  const label = '李四_' + token
  expect((await annotate(actor, { admin_label: '  ' + label + '  ', admin_note: 'met at expo' })).error).toBeNull()
  expect((await dossier(api, actor, member))).toMatchObject({ admin_label: label, admin_note: 'met at expo', name: null })
  const found = await dossiers(api, actor, { query: label.slice(0, 6).toUpperCase() })
  expect(found.items.map((r) => r.user_id)).toEqual([member])
  expect(found.items[0].admin_label).toBe(label)
  expect((await annotate(actor, { admin_note: '' })).error).toBeNull()
  expect(await dossier(api, actor, member)).toMatchObject({ admin_label: label, admin_note: null })
  expect((await annotate(actor, { admin_label: '' })).error).toBeNull()
  expect((await dossier(api, actor, member))?.admin_label).toBeNull()
  expect((await dossiers(api, actor, { query: label })).items).toEqual([])
})

it('rejects oversize values and unknown members, and labels members of any status', async () => {
  expect((await annotate(actor, { admin_label: 'x'.repeat(61) })).error?.message).toBe('INVALID_INPUT')
  expect((await annotate(actor, { admin_note: 'x'.repeat(2001) })).error?.message).toBe('INVALID_INPUT')
  expect((await api.rpc('admin_affiliate_annotate', { p_actor: actor, p_input: { user_id: outsider, admin_label: 'x' } })).error?.message).toBe('AFFILIATE_NOT_FOUND')
  expect((await api.rpc('admin_affiliate_annotate', { p_actor: actor, p_input: { user_id: pending, admin_label: 'applicant' } })).error).toBeNull()
  expect((await dossier(api, actor, pending))?.admin_label).toBe('applicant')
})

it('records the label when an admin enrolls the account', async () => {
  const fresh = await account()
  const slug = 'new-' + token
  expect((await api.rpc('admin_affiliate_create', { p_actor: actor, p_input: { user_id: fresh, slug, admin_label: ' 王五 ' } })).error).toBeNull()
  expect((await dossier(api, actor, fresh))?.admin_label).toBe('王五')
  const other = await account()
  expect((await api.rpc('admin_affiliate_create', { p_actor: actor, p_input: { user_id: other, slug: 'bare-' + token } })).error).toBeNull()
  expect((await dossier(api, actor, other))?.admin_label).toBeNull()
})
