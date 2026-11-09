import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, it, vi } from 'vitest'

import { readActivePricing } from './active-pricing'

it('reads the cutover marker afresh for each order and rejects errors and unknown values', async () => {
  const maybeSingle = vi.fn()
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: { value: 'v2' }, error: null })
    .mockResolvedValueOnce({ data: { value: 'other' }, error: null })
    .mockResolvedValueOnce({ data: null, error: { message: 'read failed' } })
  const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) } as unknown as SupabaseClient
  await expect(readActivePricing(admin)).resolves.toBeUndefined()
  await expect(readActivePricing(admin)).resolves.toBe('v2')
  await expect(readActivePricing(admin)).rejects.toThrow('unknown')
  await expect(readActivePricing(admin)).rejects.toThrow('could not be read')
})
