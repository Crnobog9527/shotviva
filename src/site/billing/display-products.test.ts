import { beforeEach, describe, expect, it, vi } from 'vitest'

const life = vi.fn()
const read = vi.fn()
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: (value: unknown) => life(value), cacheTag: () => undefined }))
vi.mock('@/core/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/core/auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))
vi.mock('@/core/env', () => ({ serverEnv: () => ({ SUPABASE_SERVICE_ROLE_KEY: 'service', PAYMENT_CHANNEL: 'stripe' }) }))
vi.mock('@/core/billing/product-catalog', () => ({ publishedOffers: () => read(), historicalProducts: vi.fn(), waffoOffers: vi.fn() }))
vi.useFakeTimers()

const { FAILED_READ_LIFE } = await import('@/core/cache-life')
const { site } = await import('../site.config')

// Run with fake timers so the retry back-off does not slow the suite.
async function display() {
  const { displayProducts } = await import('./display-products')
  const result = displayProducts()
  await vi.runAllTimersAsync()
  return result
}

describe('displayProducts (marketing and paywall catalog)', () => {
  beforeEach(() => {
    vi.resetModules()
    life.mockReset()
    read.mockReset()
  })

  it('retries a failed read before giving up', async () => {
    read.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(site.billing.products)
    expect(await display()).toEqual(site.billing.products)
    expect(read).toHaveBeenCalledTimes(2)
    expect(life).toHaveBeenLastCalledWith('hours')
  })

  it('serves the last good catalog, briefly, when every retry fails', async () => {
    const { displayProducts } = await import('./display-products')
    read.mockResolvedValueOnce(site.billing.products)
    expect(await displayProducts()).toEqual(site.billing.products)
    read.mockRejectedValue(new Error('down'))
    const result = displayProducts()
    await vi.runAllTimersAsync()
    expect(await result).toEqual(site.billing.products)
    expect(life).toHaveBeenLastCalledWith(FAILED_READ_LIFE)
  })

  it('caches an empty list only for the failed-read lifetime on a cold instance', async () => {
    read.mockRejectedValue(new Error('down'))
    expect(await display()).toEqual([])
    expect(read).toHaveBeenCalledTimes(3)
    expect(life).toHaveBeenLastCalledWith(FAILED_READ_LIFE)
  })
})
