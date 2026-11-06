import { beforeEach, describe, expect, it, vi } from 'vitest'

const cacheLife = vi.fn()
vi.mock('next/cache', () => ({ cacheLife, cacheTag: () => undefined }))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))

const { logger } = await import('../logger')
const { FAILED_READ_LIFE } = await import('../cache-life')
const { BANNER_LIFE, bannerOrEmpty } = await import('./banner-read')

describe('cached site banner', () => {
  beforeEach(() => {
    cacheLife.mockClear()
    vi.spyOn(logger, 'error').mockImplementation(() => undefined)
  })

  it('keeps a good read for the normal lifetime', async () => {
    await expect(bannerOrEmpty('en', async () => [])).resolves.toEqual({ items: [], initialId: null })
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith(BANNER_LIFE)
  })

  it('keeps a failed read (no banner) for a minute only', async () => {
    const failing = async () => {
      throw new Error('site_announcements read failed')
    }
    await expect(bannerOrEmpty('en', failing)).resolves.toEqual({ items: [], initialId: null })
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith(FAILED_READ_LIFE)
    expect(logger.error).toHaveBeenCalledWith('announcements.banner_read_failed', expect.anything())
  })
})
