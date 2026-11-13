// Features that may be limited to a membership tier (ARCHITECTURE §6.2 "新功能抢先用"). A new
// feature that should start Max-only gets an entry here first; its server entry point then
// calls requireFeature(userId, key). The key is what /admin/features writes to feature_access
// (lowercase, digits, underscores; at most 40 characters). Names are Chinese: only the admin
// page shows them.

// inviteOnly: closed to everyone except the accounts invited on /admin/features (and admins)
// until its open_to_all_at passes; the tier gate does not apply to it.
export type FeatureDefinition = { readonly key: string; readonly name: string; readonly inviteOnly?: boolean }

export const FEATURES: readonly FeatureDefinition[] = [
  // Dense-text tournament posters, phase 1: the Owner's test accounts only (Owner 2026-11-13).
  { key: 'dense_poster', name: '赛事海报（内测）', inviteOnly: true },
]

export function findFeature(registry: readonly FeatureDefinition[], key: string): FeatureDefinition | undefined {
  return registry.find((feature) => feature.key === key)
}
