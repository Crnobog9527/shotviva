import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: () => undefined, cacheTag: () => undefined }))
vi.mock('../../auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))

const { logger } = await import('@/core/logger')
const { loadBilled } = await import('./billed')
const { OpenAICostsError } = await import('./openai-costs')

describe('loadBilled', () => {
  it('says no_key when no Admin key is stored', async () => {
    expect(await loadBilled('2026-10-08', 30, async () => null)).toEqual({ status: 'no_key' })
  })

  it('passes the bill through', async () => {
    expect(await loadBilled('2026-10-08', 30, async () => ({ '2026-10-08': 1 }))).toEqual({ status: 'ok', byDay: { '2026-10-08': 1 } })
  })

  it('turns a failed read into an error result the page can show, logging no key', async () => {
    const warn = vi.spyOn(logger, 'warn')
    const result = await loadBilled('2026-10-08', 30, async () => {
      throw new OpenAICostsError('unauthorized', 401)
    })
    expect(result).toEqual({ status: 'error', failure: 'unauthorized', httpStatus: 401 })
    expect(warn).toHaveBeenCalledWith('admin.costs.openai_failed', { failure: 'unauthorized', status: 401 })
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    expect(await loadBilled('2026-10-08', 30, async () => Promise.reject(new Error('boom')))).toMatchObject({ status: 'error', failure: 'network' })
    error.mockRestore()
  })
})
