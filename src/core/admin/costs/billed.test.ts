import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: () => undefined, cacheTag: () => undefined }))
vi.mock('../../auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))

const { logger } = await import('@/core/logger')
const { loadBills, settleBill } = await import('./billed')
const { OpenAICostsError } = await import('./openai-costs')

describe('settleBill', () => {
  it('says no_key when no key is configured and passes a bill through', async () => {
    expect(await settleBill('openai', async () => null)).toEqual({ status: 'no_key' })
    expect(await settleBill('openai', async () => ({ '2026-10-08': 1 }))).toEqual({ status: 'ok', byDay: { '2026-10-08': 1 } })
  })

  it('keeps the real reason (a 429 is not 连不上) with the provider code, logging no key', async () => {
    const warn = vi.spyOn(logger, 'warn')
    const result = await settleBill('openai', async () => {
      throw new OpenAICostsError('rate_limited', 429, 'insufficient_quota')
    })
    expect(result).toEqual({ status: 'error', failure: 'rate_limited', httpStatus: 429, code: 'insufficient_quota' })
    expect(warn).toHaveBeenCalledWith('admin.costs.bill_failed', { provider: 'openai', failure: 'rate_limited', status: 429, code: 'insufficient_quota' })
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    expect(await settleBill('openrouter', async () => Promise.reject(new Error('boom')))).toMatchObject({ status: 'error', failure: 'network' })
    error.mockRestore()
  })
})

describe('loadBills', () => {
  it('reads OpenAI and OpenRouter, and marks Ark as not connected', async () => {
    const openai = vi.fn(async () => ({ status: 'ok' as const, byDay: { '2026-10-08': 1 } }))
    const openrouter = vi.fn(async () => ({ status: 'no_key' as const }))
    expect(await loadBills('2026-10-08', 30, { openai, openrouter })).toEqual({
      openai: { status: 'ok', byDay: { '2026-10-08': 1 } }, openrouter: { status: 'no_key' }, ark: { status: 'not_connected' },
    })
    expect(openai).toHaveBeenCalledWith('2026-10-08', 30)
  })
})
