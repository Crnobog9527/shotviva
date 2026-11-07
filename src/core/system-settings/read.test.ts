import { beforeEach, describe, expect, it, vi } from 'vitest'

const cacheLife = vi.fn()
vi.mock('next/cache', () => ({ cacheLife, cacheTag: () => undefined }))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))

const { logger } = await import('../logger')
const { FAILED_READ_LIFE } = await import('../cache-life')
const { SETTINGS_LIFE, settingsOrDefaults } = await import('./read')
const { settingValue } = await import('./registry')

describe('cached system settings (T62)', () => {
  beforeEach(() => {
    cacheLife.mockClear()
    vi.spyOn(logger, 'error').mockImplementation(() => undefined)
  })

  it('keeps a good read for the normal lifetime', async () => {
    await expect(settingsOrDefaults(async () => ({ wishlist_enabled: true }))).resolves.toEqual({ wishlist_enabled: true })
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith(SETTINGS_LIFE)
  })

  it('falls back to the defaults (wishlist closed) and keeps that for a minute only', async () => {
    const failing = async () => {
      throw new Error('system_settings read failed')
    }
    const values = await settingsOrDefaults(failing)
    expect(values).toEqual({})
    expect(settingValue(values, 'wishlist_enabled')).toBe(false)
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith(FAILED_READ_LIFE)
    expect(logger.error).toHaveBeenCalledWith('system_settings.read_failed', expect.anything())
  })
})
