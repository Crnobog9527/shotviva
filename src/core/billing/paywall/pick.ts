import type { MembershipProduct, PackProduct } from '../../config'
import type { CheckoutTone } from './checkout-bar'
import { productFor, type Period, type TierOffer } from './offer'
import { isTierPick, type PaywallPick } from './use-paywall-state'

// What the one paywall pick buys: a plan at the chosen period, or a pack. Pure, so the
// checkout bar's product, wording and colour are unit-tested.
export type ResolvedPick = { kind: 'plan'; offer: TierOffer; product: MembershipProduct } | { kind: 'pack'; product: PackProduct }

export function resolvePick(pick: PaywallPick, period: Period, offers: readonly TierOffer[], packs: readonly PackProduct[]): ResolvedPick | null {
  if (isTierPick(pick)) {
    const offer = offers.find((o) => o.tier === pick)
    return offer ? { kind: 'plan', offer, product: productFor(offer, period) } : null
  }
  const pack = packs.find((p) => p.id === pick)
  return pack ? { kind: 'pack', product: pack } : null
}

// comps-v3-b paywall.html: the recommended Pro keeps the safelight primary, Max is gold foil,
// Starter and the packs are bone.
export function checkoutTone(resolved: ResolvedPick): CheckoutTone {
  if (resolved.kind === 'pack') return 'bone'
  if (resolved.offer.tier === 'pro') return 'primary'
  return resolved.offer.tier === 'max' ? 'gold' : 'bone'
}
