import type { RequiredTier } from '@/core/errors'

// Shared with the client editor, so no server-only import here.
export type FeatureSetting = {
  key: string
  name: string
  minTier: RequiredTier | null
  openToAllAt: string | null
}

export type FeatureAccessInput = { key: string; minTier: RequiredTier | null; openToAllAt: string | null }
