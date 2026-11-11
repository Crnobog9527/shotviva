'use client'

import { usePaywall } from '@/core/billing/paywall/provider'
import { batchUpgrade, limitsFor } from '@/core/billing/tier-limits'
import type { MembershipTier } from '@/core/config'

import type { PhotoBatch } from './use-photo-batch'

// The "picked more photos than the plan runs" moment (T107 「多选照片 → Pro」): the pick still
// keeps what fits, and the paywall opens on the plan that runs the whole pick (Pro from
// Starter, Max from Pro). Only where the tier sets the limit: the creation dialog takes one
// photo on every plan and never opens it.
export function canOpenOnOverPick(tier: MembershipTier | null, batchMax: number) {
  return batchUpgrade(tier) !== null && limitsFor(tier).batchMax === batchMax
}

export function useOverPick(tier: MembershipTier | null, photos: PhotoBatch) {
  const paywall = usePaywall()
  return (files: File[]) => {
    const room = photos.batchMax <= 1 ? 1 : photos.batchMax - photos.photos.length
    photos.add(files)
    const next = batchUpgrade(tier)
    if (next && files.length > room && canOpenOnOverPick(tier, photos.batchMax)) {
      paywall.open('tier_required', { step: 'period', tier: next, moment: 'photos' })
    }
  }
}
