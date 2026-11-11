import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { loadSettingSwitch, saveSettingSwitch } from '@/core/admin'
import { loadSystemSettings, settingValue } from '@/core/system-settings'

import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

// T108: the public gallery's two runtime switches (ARCHITECTURE §9 第 1、5 条, migration 1201),
// through the command the /admin/features cards call. Both are off until saved, only an unbanned
// admin may save them, and every save leaves an audit row.

const KEYS = ['gallery_enabled', 'gallery_auto_approve'] as const
let db: Client
let admin: string
let user: string
const service = serviceSupabase()
const save = (actor: string, key: (typeof KEYS)[number], enabled: unknown) =>
  saveSettingSwitch({ db: service, invalidate: () => undefined }, actor, key, { enabled })
const audits = async (actor: string) =>
  (
    await db.query(
      `select target_id, reason from public.admin_audit_log where action = 'gallery_setting' and user_id = $1 order by id`,
      [actor],
    )
  ).rows

beforeAll(async () => {
  db = await connectAdmin()
  admin = await createUser(db)
  await db.query("update public.profiles set role = 'admin' where id = $1", [admin])
  user = await createUser(db)
})

beforeEach(async () => {
  await db.query(`delete from public.system_settings where key = any($1)`, [KEYS])
})

afterAll(async () => {
  await db.query(`delete from public.system_settings where key = any($1)`, [KEYS])
  await db.end()
})

describe('gallery switches', () => {
  it.each(KEYS)('%s is off until saved, then follows the admin and is audited', async (key) => {
    expect((await loadSettingSwitch(service, key)).enabled).toBe(false)
    expect(settingValue(await loadSystemSettings(service), key)).toBe(false)

    await save(admin, key, true)
    expect((await loadSettingSwitch(service, key)).enabled).toBe(true)
    expect(settingValue(await loadSystemSettings(service), key)).toBe(true)
    await save(admin, key, false)
    expect((await loadSettingSwitch(service, key)).enabled).toBe(false)

    const rows = (await audits(admin)).filter((row) => row.target_id === key)
    expect(rows.slice(-2)).toEqual([
      { target_id: key, reason: 'true' },
      { target_id: key, reason: 'false' },
    ])
  })

  it('refuses a non-admin, a banned admin and a value of the wrong type, without a row or an audit', async () => {
    await expect(save(user, 'gallery_enabled', true)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    const banned = await createUser(db)
    await db.query("update public.profiles set role = 'admin', banned_at = now() where id = $1", [banned])
    await expect(save(banned, 'gallery_enabled', true)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    const { error } = await service.rpc('admin_set_system_setting', { p_key: 'gallery_enabled', p_value: 'true', p_actor: admin })
    expect(error?.message).toBe('INVALID_INPUT')
    const { rows } = await db.query(`select count(*)::int as n from public.system_settings where key = any($1)`, [KEYS])
    expect(rows[0].n).toBe(0)
    expect(await audits(user)).toEqual([])
    expect(await audits(banned)).toEqual([])
  })

  it('the wishlist switch still saves without a gallery audit row', async () => {
    const before = (await audits(admin)).length
    await saveSettingSwitch({ db: service, invalidate: () => undefined }, admin, 'wishlist_enabled', { enabled: false })
    expect((await audits(admin)).length).toBe(before)
    await db.query(`delete from public.system_settings where key = 'wishlist_enabled'`)
  })
})
