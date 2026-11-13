import { describe, expect, it, vi } from 'vitest'

import { AppError, TierRequiredError } from '../errors'
import type { FeatureAccess } from './access'
import { requireFeature, type RequireFeatureDeps } from './require-feature'

const NOW = Date.parse('2026-11-06T12:00:00Z')
const registry = [{ key: 'studio_video', name: '视频工作室' }, { key: 'beta_posters', name: '内测', inviteOnly: true }]

function deps(rows: FeatureAccess[], tier: 'starter' | 'pro' | 'max' | null, invited = false): RequireFeatureDeps & { tierOf: ReturnType<typeof vi.fn> } {
  return { registry, loadAccess: async () => rows, tierOf: vi.fn(async () => tier), invited: async () => invited, now: () => NOW }
}

const gated = (minTier: 'pro' | 'max', openToAllAt: string | null = null): FeatureAccess[] => [
  { key: 'studio_video', minTier, openToAllAt },
]

describe('requireFeature', () => {
  it('throws TIER_REQUIRED naming the missing tier when the tier is too low', async () => {
    const error = await requireFeature('user-1', 'studio_video', deps(gated('max'), 'pro')).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TierRequiredError)
    expect((error as TierRequiredError).toBody()).toMatchObject({ code: 'TIER_REQUIRED', required_tier: 'max' })
    expect((error as TierRequiredError).status).toBe(403)
  })

  it('throws for an account with no tier and passes for one at or above the tier', async () => {
    await expect(requireFeature('user-1', 'studio_video', deps(gated('pro'), null))).rejects.toMatchObject({
      requiredTier: 'pro',
    })
    await expect(requireFeature('user-1', 'studio_video', deps(gated('pro'), 'pro'))).resolves.toBeUndefined()
    await expect(requireFeature('user-1', 'studio_video', deps(gated('pro'), 'max'))).resolves.toBeUndefined()
  })

  it('skips the tier lookup when the feature is open to everyone', async () => {
    for (const rows of [[], gated('max', '2026-11-01T00:00:00Z')]) {
      const d = deps(rows, null)
      await expect(requireFeature('user-1', 'studio_video', d)).resolves.toBeUndefined()
      expect(d.tierOf).not.toHaveBeenCalled()
    }
  })

  it('refuses a key that is not in the registry instead of leaving it open', async () => {
    const error = await requireFeature('user-1', 'studio_vidoe', deps([], 'max')).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('INTERNAL')
  })

  describe('invite-only', () => {
    const row = (openToAllAt: string | null): FeatureAccess[] => [{ key: 'beta_posters', minTier: null, openToAllAt }]

    it('is closed to a Max account that was not invited, even with no row at all', async () => {
      for (const rows of [[], row(null)]) {
        const error = await requireFeature('user-1', 'beta_posters', deps(rows, 'max')).catch((e: unknown) => e)
        expect((error as AppError).code).toBe('FORBIDDEN')
      }
    })

    it('opens to an invited account whatever its tier', async () => {
      await expect(requireFeature('user-1', 'beta_posters', deps([], null, true))).resolves.toBeUndefined()
    })

    it('opens to everyone once open_to_all_at has passed, and not before', async () => {
      await expect(requireFeature('user-1', 'beta_posters', deps(row('2026-11-01T00:00:00Z'), null))).resolves.toBeUndefined()
      await expect(requireFeature('user-1', 'beta_posters', deps(row('2026-12-01T00:00:00Z'), 'max'))).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })
})
