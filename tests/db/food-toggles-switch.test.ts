import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadSettingSwitch, saveSettingSwitch } from '@/core/admin'

import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

// 2009: food_plating_enabled and food_tableware_enabled through the command the /admin/features
// cards call (admin_set_food_switch). Off with no row, saved apart from each other; only an unbanned
// admin may save them, and only as a boolean. The 1848 food_toggles_enabled stays writable through
// admin_set_system_setting, for the release before this one.

type FoodKey = 'food_plating_enabled' | 'food_tableware_enabled'
let db: Client
let admin: string
const service = serviceSupabase()
const save = (actor: string, key: FoodKey, enabled: unknown) => saveSettingSwitch({ db: service, invalidate: () => undefined }, actor, key, { enabled })
const rpc = (actor: string, key: string, value: unknown) => service.rpc('admin_set_food_switch', { p_key: key, p_value: value, p_actor: actor })
const enabled = async (key: FoodKey) => (await loadSettingSwitch(service, key)).enabled
const clear = () => db.query("delete from public.system_settings where key in ('food_plating_enabled','food_tableware_enabled','food_toggles_enabled')")

beforeAll(async () => {
  db = await connectAdmin()
  admin = await createUser(db)
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
  await clear()
})

afterAll(async () => {
  await clear()
  await db.end()
})

describe('food switches (2009)', () => {
  it('are off until saved, then each follows its own admin save', async () => {
    expect([await enabled('food_plating_enabled'), await enabled('food_tableware_enabled')]).toEqual([false, false])
    await save(admin, 'food_tableware_enabled', true)
    expect([await enabled('food_plating_enabled'), await enabled('food_tableware_enabled')]).toEqual([false, true])
    await save(admin, 'food_plating_enabled', true)
    await save(admin, 'food_tableware_enabled', false)
    expect([await enabled('food_plating_enabled'), await enabled('food_tableware_enabled')]).toEqual([true, false])
  })

  it('refuses a non-boolean, another key, a non-admin and a banned admin', async () => {
    expect((await rpc(admin, 'food_tableware_enabled', 'true')).error?.message).toBe('INVALID_INPUT')
    expect((await rpc(admin, 'gallery_enabled', true)).error?.message).toBe('INVALID_INPUT')
    expect((await rpc(admin, 'food_toggles_enabled', true)).error?.message).toBe('INVALID_INPUT')
    expect((await rpc(await createUser(db), 'food_tableware_enabled', true)).error?.message).toBe('NOT_ADMIN')
    const banned = await createUser(db)
    await db.query("update public.profiles set role = 'admin', banned_at = now() where id = $1", [banned])
    expect((await rpc(banned, 'food_tableware_enabled', true)).error?.message).toBe('NOT_ADMIN')
  })

  it('is closed to browsers', async () => {
    const { rows } = await db.query(`select has_function_privilege('anon', 'public.admin_set_food_switch(text,jsonb,uuid)', 'execute') as anon,
      has_function_privilege('authenticated', 'public.admin_set_food_switch(text,jsonb,uuid)', 'execute') as authed`)
    expect(rows[0]).toEqual({ anon: false, authed: false })
  })

  it('keeps the 1848 combined switch writable for the release before this one', async () => {
    const { error } = await service.rpc('admin_set_system_setting', { p_key: 'food_toggles_enabled', p_value: true, p_actor: admin })
    expect(error).toBeNull()
  })
})
