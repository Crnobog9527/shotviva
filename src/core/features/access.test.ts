import { describe, expect, it } from 'vitest'

import { featureOpen, missingTier, type FeatureAccess } from './access'

const NOW = Date.parse('2026-11-06T12:00:00Z')
const row = (minTier: FeatureAccess['minTier'], openToAllAt: string | null = null): FeatureAccess => ({
  key: 'studio_video',
  minTier,
  openToAllAt,
})

describe('featureOpen (ARCHITECTURE §6.2 新功能抢先用)', () => {
  it('opens to everyone, no tier included, without a row', () => {
    expect(featureOpen(null, null, NOW)).toBe(true)
    expect(featureOpen(null, undefined, NOW)).toBe(true)
  })

  it('opens to everyone when min_tier is null, whatever the date says', () => {
    expect(featureOpen(null, row(null), NOW)).toBe(true)
    expect(featureOpen(null, row(null, '2027-01-01T00:00:00Z'), NOW)).toBe(true)
  })

  it('opens to everyone once open_to_all_at has passed, and at that very moment', () => {
    expect(featureOpen(null, row('max', '2026-11-01T00:00:00Z'), NOW)).toBe(true)
    expect(featureOpen('starter', row('max', '2026-11-06T12:00:00Z'), NOW)).toBe(true)
  })

  it('keeps the gate before open_to_all_at', () => {
    expect(featureOpen('pro', row('max', '2026-11-06T12:00:01Z'), NOW)).toBe(false)
  })

  it.each([
    [null, 'pro', false],
    ['starter', 'pro', false],
    ['pro', 'pro', true],
    ['max', 'pro', true],
    [null, 'max', false],
    ['starter', 'max', false],
    ['pro', 'max', false],
    ['max', 'max', true],
  ] as const)('tier %s against min_tier %s → %s', (tier, minTier, open) => {
    expect(featureOpen(tier, row(minTier), NOW)).toBe(open)
  })

  it('names the tier still missing, so the paywall can preselect it', () => {
    expect(missingTier('pro', row('max'), NOW)).toBe('max')
    expect(missingTier(null, row('pro'), NOW)).toBe('pro')
    expect(missingTier('max', row('max'), NOW)).toBeNull()
  })

  it('accepts a Date as well as epoch milliseconds', () => {
    expect(featureOpen('pro', row('max', '2026-11-01T00:00:00Z'), new Date(NOW))).toBe(true)
  })
})
