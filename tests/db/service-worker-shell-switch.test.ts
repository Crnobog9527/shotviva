import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadSettingSwitch, saveSettingSwitch } from '@/core/admin'

import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

// 2000: service_worker_shell_enabled (Create's app shell, ARCHITECTURE §18.3) through the command the
// /admin/features card calls. Off with no row;
// only an unbanned admin may save it, and only as a boolean.

let db: Client
let admin: string
const service = serviceSupabase()
const save = (actor: string, enabled: unknown) => saveSettingSwitch({ db: service, invalidate: () => undefined }, actor, 'service_worker_shell_enabled', { enabled })
const rpc = (actor: string, value: unknown) => service.rpc('admin_set_system_setting', { p_key: 'service_worker_shell_enabled', p_value: value, p_actor: actor })

beforeAll(async () => {
  db = await connectAdmin()
  admin = await createUser(db)
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
  await db.query("delete from public.system_settings where key = 'service_worker_shell_enabled'")
})

afterAll(async () => {
  await db.query("delete from public.system_settings where key = 'service_worker_shell_enabled'")
  await db.end()
})

describe('service_worker_shell_enabled (2000)', () => {
  it('is off until saved, then follows the admin save', async () => {
    expect((await loadSettingSwitch(service, 'service_worker_shell_enabled')).enabled).toBe(false)
    await save(admin, true)
    expect((await loadSettingSwitch(service, 'service_worker_shell_enabled')).enabled).toBe(true)
    await save(admin, false)
    expect((await loadSettingSwitch(service, 'service_worker_shell_enabled')).enabled).toBe(false)
  })

  it('refuses a non-boolean, a non-admin and a banned admin', async () => {
    expect((await rpc(admin, 'true')).error?.message).toBe('INVALID_INPUT')
    expect((await rpc(await createUser(db), true)).error?.message).toBe('NOT_ADMIN')
    const banned = await createUser(db)
    await db.query("update public.profiles set role = 'admin', banned_at = now() where id = $1", [banned])
    expect((await rpc(banned, true)).error?.message).toBe('NOT_ADMIN')
  })
})
