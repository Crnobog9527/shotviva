import type { FeatureMinTier } from '@/core/features/access'

// Shared with the client editor, so no server-only import here.
export type FeatureSetting = {
  key: string
  name: string
  minTier: FeatureMinTier | null
  openToAllAt: string | null
  // Invite-only features (registry inviteOnly) list their invited accounts instead of a tier.
  inviteOnly: boolean
  invites: FeatureInvite[]
}

// One invited account, shown by the email or phone it signs in with.
export type FeatureInvite = { userId: string; account: string; invitedAt: string }

export type FeatureInviteInput = { key: string; account: string; invited: boolean }

export type FeatureAccessInput = { key: string; minTier: FeatureMinTier | null; openToAllAt: string | null }
