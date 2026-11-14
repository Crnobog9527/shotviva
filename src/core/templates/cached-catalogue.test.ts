import { beforeEach, describe, expect, it, vi } from 'vitest'

const cacheLife = vi.fn()
vi.mock('next/cache', () => ({ cacheLife, cacheTag: () => undefined }))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))

const { logger } = await import('../logger')
const { FAILED_READ_LIFE } = await import('../cache-life')
const { CATALOGUE_LIFE, catalogueOrEmpty, findWebTemplate } = await import('./cached-catalogue')

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

// A template's workspace reads the cached catalogue, and only a miss goes to the database (#520).
describe('findWebTemplate', () => {
  const db = {} as never
  const tpl = (id: string) => ({ id }) as never

  it('answers from the cache without a database read', async () => {
    const live = vi.fn()
    await expect(findWebTemplate(db, 'en', 'a', { cached: async () => [tpl('a'), tpl('b')], live })).resolves.toEqual({ id: 'a' })
    expect(live).not.toHaveBeenCalled()
  })

  it('reads a template the cache has not seen yet live, once', async () => {
    const live = vi.fn(async () => [tpl('new')])
    await expect(findWebTemplate(db, 'zh', 'new', { cached: async () => [tpl('a')], live })).resolves.toEqual({ id: 'new' })
    expect(live).toHaveBeenCalledExactlyOnceWith(db, 'zh', 'new')
  })

  it('is null when neither has it (the page 404s)', async () => {
    await expect(findWebTemplate(db, 'en', 'gone', { cached: async () => [], live: async () => [] })).resolves.toBeNull()
  })

  // A read that fails (a statement timeout under load, 2026-11-14 on the test site) must reach the
  // app's error state with its Retry, never look like a template that does not exist.
  it('throws, never null, when the cached read fails', async () => {
    const timeout = new Error('listTemplates failed: canceling statement due to statement timeout')
    await expect(findWebTemplate(db, 'en', 'a', { cached: async () => { throw timeout }, live: async () => [tpl('a')] })).rejects.toBe(timeout)
  })

  it('throws, never null, when the live read of a cache miss fails', async () => {
    const timeout = new Error('listTemplates failed: canceling statement due to statement timeout')
    await expect(findWebTemplate(db, 'en', 'new', { cached: async () => [], live: async () => { throw timeout } })).rejects.toBe(timeout)
  })
})
