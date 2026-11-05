import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { maskEmail, partnerProfile } from './partner-views'

// Just enough of a client for `from('profiles').select(...).eq(...).maybeSingle()`.
const clientReturning = (row: Record<string, unknown>) =>
  ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
  }) as unknown as SupabaseClient

describe('partnerProfile', () => {
  it('reads both pools and the display-only membership date', async () => {
    const profile = await partnerProfile(
      clientReturning({ credits: 30, free_credits: 3, paid_until: '2030-01-01T00:00:00+00:00' }),
      'u',
    )
    expect(profile).toEqual({ credits: 30, freeCredits: 3, paidUntil: '2030-01-01T00:00:00.000Z' })
  })
})

describe('maskEmail', () => {
  it.each([
    ['jane@gmail.com', 'j***@gmail.com'],
    [null, 'Shotviva account'],
    ['@nobody', 'Shotviva account'],
  ])('%s → %s', (email, masked) => {
    expect(maskEmail(email)).toBe(masked)
  })
})
