import { describe, expect, it } from 'vitest'

import { TIER_LIMITS } from '@/core/billing/tier-limits'
import { MAX_BATCH_TEMPLATES } from '@/core/jobs/batch/limits'

import { batchCaps, batchCounts, isLocked } from './feature-access'

describe('batchCaps (Batch create, Owner 2026-11-12)', () => {
  it('has no batch below Pro', () => {
    expect(batchCaps(null)).toBeNull()
    expect(batchCaps('starter')).toBeNull()
  })

  it('gives Pro one template on up to its batch size', () => {
    expect(batchCaps('pro')).toEqual({ templates: 1, cells: TIER_LIMITS.pro.batchMax })
  })

  it('gives Max (and an admin, who counts as Max) several templates up to its batch size', () => {
    expect(batchCaps('max')).toEqual({ templates: MAX_BATCH_TEMPLATES, cells: TIER_LIMITS.max.batchMax })
  })

  it('locks batch below Pro and several templates below Max', () => {
    const tiers = [null, 'starter', 'pro', 'max'] as const
    expect(tiers.map((tier) => isLocked('batch', tier))).toEqual([true, true, false, false])
    expect(tiers.map((tier) => isLocked('templates', tier))).toEqual([true, true, true, false])
  })

  it('prints the batch sizes the server enforces', () => {
    expect(batchCounts()).toEqual({ pro: TIER_LIMITS.pro.batchMax, max: TIER_LIMITS.max.batchMax })
  })
})
