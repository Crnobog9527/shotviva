import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { loadWishlistSwitch, saveWishlistSwitch } from '@/core/admin'
import { loadSystemSettings, settingValue } from '@/core/system-settings'

import { anonClient, connectAdmin, createUser, retryAuth, serviceClient } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// T62: system_settings and admin_set_system_setting (ARCHITECTURE §15.6), through the same
// command the /admin/features card calls. The table is global and other test files write their
// own keys in parallel (the test-run budget, T85), so these tests count only wishlist_enabled and
// each starts from "never saved".

let db: Client
let admin: string
let adminEmail: string
let user: string
const service = serviceSupabase()
const save = (actor: string, enabled: unknown) => saveWishlistSwitch({ db: service, invalidate: () => undefined }, actor, { enabled })
const rpc = (args: Record<string, unknown>) => serviceClient().rpc('admin_set_system_setting', args)
const rowOf = async () =>
  (await db.query(`select value, updated_by from public.system_settings where key = 'wishlist_enabled'`)).rows[0]

beforeAll(async () => {
  db = await connectAdmin()
  // Through the Auth API, so the card can look the admin's email up like it does live.
  adminEmail = `t62-admin-${randomUUID()}@example.test`
  const created = await retryAuth(async () => {
    const { data, error } = await service.auth.admin.createUser({ email: adminEmail, email_confirm: true })
    if (error) throw error
    return data.user
  })
  admin = created.id
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
  user = await createUser(db)
})

beforeEach(async () => {
  await db.query(`delete from public.system_settings where key = 'wishlist_enabled'`)
})

afterAll(async () => {
  await db.query(`delete from public.system_settings where key = 'wishlist_enabled'`)
  await db.end()
})

describe('admin_set_system_setting', () => {
  it('is off until saved, then on and off again, recording who saved it', async () => {
    expect(await loadWishlistSwitch(service)).toEqual({ enabled: false, updatedAt: null, updatedByEmail: null })
    expect(settingValue(await loadSystemSettings(service), 'wishlist_enabled')).toBe(false)

    await save(admin, true)
    expect(await rowOf()).toEqual({ value: true, updated_by: admin })
    expect(settingValue(await loadSystemSettings(service), 'wishlist_enabled')).toBe(true)
    const shown = await loadWishlistSwitch(service)
    expect(shown).toMatchObject({ enabled: true, updatedByEmail: adminEmail })
    expect(Date.parse(shown.updatedAt ?? '')).not.toBeNaN()

    await save(admin, false)
    expect(await rowOf()).toEqual({ value: false, updated_by: admin })
    expect((await db.query(`select count(*)::int as n from public.system_settings where key = 'wishlist_enabled'`)).rows[0].n).toBe(1)
  })

  it('refuses an actor who is not an admin, and a missing actor', async () => {
    await expect(save(user, true)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await rpc({ p_key: 'wishlist_enabled', p_value: true, p_actor: null })).error?.message).toBe('INVALID_INPUT')
    expect(await rowOf()).toBeUndefined()
  })

  it('refuses a key that is not registered and a value of the wrong type', async () => {
    expect((await rpc({ p_key: 'not_registered', p_value: true, p_actor: admin })).error?.message).toBe('INVALID_INPUT')
    expect((await rpc({ p_key: 'wishlist_enabled', p_value: 'true', p_actor: admin })).error?.message).toBe('INVALID_INPUT')
    expect((await rpc({ p_key: 'wishlist_enabled', p_value: null, p_actor: admin })).error?.message).toBe('INVALID_INPUT')
    expect((await db.query(`select count(*)::int as n from public.system_settings where key = 'wishlist_enabled'`)).rows[0].n).toBe(0)
  })
})

describe('system_settings privacy', () => {
  it('no client role can read the table or call the function', async () => {
    await save(admin, true)
    const { data, error } = await anonSupabase().from('system_settings').select('key, value')
    expect(error ?? data).toBeTruthy()
    expect(data ?? []).toEqual([])
    const { error: rpcError } = await anonClient().rpc('admin_set_system_setting', {
      p_key: 'wishlist_enabled',
      p_value: false,
      p_actor: admin,
    })
    expect(rpcError).not.toBeNull()
    expect(await rowOf()).toEqual({ value: true, updated_by: admin })
  })

  it('a signed-in user cannot call the function either', async () => {
    const { rows } = await db.query(
      `select has_function_privilege('authenticated', 'public.admin_set_system_setting(text, jsonb, uuid)', 'execute') as auth,
              has_function_privilege('anon', 'public.admin_set_system_setting(text, jsonb, uuid)', 'execute') as anon,
              has_table_privilege('authenticated', 'public.system_settings', 'select') as auth_select`,
    )
    expect(rows[0]).toEqual({ auth: false, anon: false, auth_select: false })
  })

  it('has RLS on with no policy', async () => {
    const { rows } = await db.query(
      `select c.relrowsecurity as rls, (select count(*)::int from pg_policies p where p.tablename = 'system_settings') as policies
         from pg_class c where c.oid = 'public.system_settings'::regclass`,
    )
    expect(rows[0]).toEqual({ rls: true, policies: 0 })
  })
})
