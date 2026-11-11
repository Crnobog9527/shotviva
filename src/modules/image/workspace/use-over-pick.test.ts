import { describe, expect, it, vi } from 'vitest'

vi.mock('@/core/billing/paywall/provider', () => ({ usePaywall: () => ({ open: vi.fn() }) }))

import { canOpenOnOverPick } from './use-over-pick'

describe('the over-pick paywall moment', () => {
  it('opens where the plan sets the limit and a bigger plan exists', () => {
    expect(canOpenOnOverPick(null, 1)).toBe(true)
    expect(canOpenOnOverPick('starter', 1)).toBe(true)
    expect(canOpenOnOverPick('pro', 10)).toBe(true)
  })
  it('stays shut in the one-photo creation dialog of a batch plan, and on Max', () => {
    expect(canOpenOnOverPick('pro', 1)).toBe(false)
    expect(canOpenOnOverPick('max', 30)).toBe(false)
  })
})
