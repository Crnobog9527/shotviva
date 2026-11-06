import { beforeEach, describe, expect, it, vi } from 'vitest'

const cacheLife = vi.fn()
vi.mock('next/cache', () => ({ cacheLife, cacheTag: () => undefined }))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))

const { logger } = await import('../logger')
const { FAILED_READ_LIFE } = await import('../cache-life')
const { CATALOGUE_LIFE, catalogueOrEmpty } = await import('./cached-catalogue')

// A production build prerendered while the database lacked a new column: the empty fallback
// was cached for an hour and the home generator said "Templates are on the way" (#202).
describe('cached web catalogue', () => {
  beforeEach(() => {
    cacheLife.mockClear()
    vi.spyOn(logger, 'error').mockImplementation(() => undefined)
  })

  it('keeps a good read for the normal lifetime', async () => {
    const live = [{ id: 'white-background' }] as never
    await expect(catalogueOrEmpty('en', async () => live)).resolves.toBe(live)
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith(CATALOGUE_LIFE)
  })

  it('keeps a failed read (empty list) for a minute only, and logs it', async () => {
    const failing = async () => {
      throw new Error('column templates.featured_rank does not exist')
    }
    await expect(catalogueOrEmpty('en', failing)).resolves.toEqual([])
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith(FAILED_READ_LIFE)
    expect(logger.error).toHaveBeenCalledWith('templates.catalogue_read_failed', expect.anything())
  })

  it('keeps the failure lifetime short but still prerenderable (cacheLife docs)', () => {
    expect(FAILED_READ_LIFE.revalidate).toBeLessThanOrEqual(60)
    // expire under 5 minutes would make the read a request-time hole on static pages.
    expect(FAILED_READ_LIFE.expire).toBeGreaterThanOrEqual(300)
    expect(FAILED_READ_LIFE.expire).toBeGreaterThan(FAILED_READ_LIFE.revalidate)
  })
})
