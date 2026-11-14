import type { MembershipTier, ProductId } from '../../../config'

// The six purchase celebrations (comps-v3-b demo-celebrate.html, DESIGN 「购买成功的庆祝动效」,
// T55), one step up each: three packs, then Starter, Pro, Max. Monthly and yearly of a tier
// celebrate alike.
export type CelebrationLevel = 'pack_s' | 'pack_m' | 'pack_l' | 'starter' | 'pro' | 'max'

export function levelOf(productId: ProductId, tier: MembershipTier | null): CelebrationLevel {
  if (productId === 'pack_s' || productId === 'pack_m' || productId === 'pack_l') return productId
  return tier ?? 'pack_s'
}

// The plate takes the paywall's material for the two upper tiers (sapphire glass, black and
// gold); the rest keep the plain card.
export function plateMaterial(level: CelebrationLevel): 'pro' | 'max' | null {
  return level === 'pro' || level === 'max' ? level : null
}
