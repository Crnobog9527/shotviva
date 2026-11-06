// Tier gates for new features (ARCHITECTURE §6.2 "新功能抢先用"). Client code imports
// '@/core/features/access' for the pure rule; this entry is server-only.
export {
  FEATURE_MIN_TIERS,
  featureAccessRowSchema,
  featureOpen,
  missingTier,
  type FeatureAccess,
  type FeatureMinTier,
} from './access'
export { cachedFeatureAccess, featureAccessFor, FEATURES_CACHE_TAG, loadFeatureAccess } from './read'
export { FEATURES, findFeature, type FeatureDefinition } from './registry'
export { requireFeature, type RequireFeatureDeps } from './require-feature'
