import { describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ cacheLife: () => undefined, cacheTag: () => undefined }))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))

const { signupGiftCredits } = await import('./signup-gift-credits')

// 2008: the signup gift's amount as the site states it, from the cached settings read.
describe('signupGiftCredits', () => {
  it('is the saved amount', async () => {
    expect(await signupGiftCredits(async () => ({ signup_gift_credits: 300 }))).toBe(300)
    expect(await signupGiftCredits(async () => ({ signup_gift_credits: 1 }))).toBe(1)
    expect(await signupGiftCredits(async () => ({ signup_gift_credits: 5000 }))).toBe(5000)
  })

  // As signup_gift_amount grants: no row, or a value outside 1–5000, means 200 (Owner 2026-11-27).
  it.each([undefined, 0, 5001, 2.5, '300', null])('falls back to 200 for %o', async (value) => {
    expect(await signupGiftCredits(async () => ({ signup_gift_credits: value }))).toBe(200)
  })

  it('falls back to 200 when the settings read failed (the cached read returns no values)', async () => {
    expect(await signupGiftCredits(async () => ({}))).toBe(200)
  })
})
