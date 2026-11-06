// Features that may be limited to a membership tier (ARCHITECTURE §6.2 "新功能抢先用"). A new
// feature that should start Max-only gets an entry here first; its server entry point then
// calls requireFeature(userId, key). The key is what /admin/features writes to feature_access
// (lowercase, digits, underscores; at most 40 characters). Names are Chinese: only the admin
// page shows them.

export type FeatureDefinition = { readonly key: string; readonly name: string }

// Empty until the first gated feature ships; /admin/features then lists it.
export const FEATURES: readonly FeatureDefinition[] = []

export function findFeature(registry: readonly FeatureDefinition[], key: string): FeatureDefinition | undefined {
  return registry.find((feature) => feature.key === key)
}
