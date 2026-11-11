import { describe, expect, it } from 'vitest'

import { TIER_LIMITS } from '@/core/billing/tier-limits'

import { batchCounts, featureAccess } from './feature-access'

describe('featureAccess', () => {
  it('locks batch below Pro and opens the paywall on Pro', () => {
    expect(featureAccess('batch', null)).toEqual({ kind: 'locked', needs: 'pro' })
    expect(featureAccess('batch', 'starter')).toEqual({ kind: 'locked', needs: 'pro' })
  })

  it('shows a Pro member how to batch inside a template, with Max as the next step', () => {
    expect(featureAccess('batch', 'pro')).toEqual({ kind: 'guide', more: 'max' })
  })

  it('locks several templates below Max, on Max', () => {
    for (const tier of [null, 'starter', 'pro'] as const) expect(featureAccess('templates', tier)).toEqual({ kind: 'locked', needs: 'max' })
  })

  it('sends Max straight into the batch workspace for both', () => {
    expect(featureAccess('batch', 'max')).toEqual({ kind: 'open', href: '/generate/batch' })
    expect(featureAccess('templates', 'max')).toEqual({ kind: 'open', href: '/generate/batch' })
  })

  it('prints the batch sizes the server enforces', () => {
    expect(batchCounts()).toEqual({ pro: TIER_LIMITS.pro.batchMax, max: TIER_LIMITS.max.batchMax })
  })
})
