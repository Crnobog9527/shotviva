import type { FeatureMinTier } from '@/core/features/access'

// Shared with the client editor, so no server-only import here.
export type FeatureSetting = {
  key: string
  name: string
  minTier: FeatureMinTier | null
  openToAllAt: string | null
}

export type FeatureAccessInput = { key: string; minTier: FeatureMinTier | null; openToAllAt: string | null }
