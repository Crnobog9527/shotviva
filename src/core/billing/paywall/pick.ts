import type { MembershipProduct, PackProduct } from '../../config'
import type { CheckoutTone } from './checkout-bar'
import { productFor, type Period, type TierOffer } from './offer'
import { isTierPick, type PaywallChoice, type PaywallPick } from './use-paywall-state'

// What the one paywall pick buys: a plan at the chosen period, or a pack. Pure, so the
// checkout bar's product, wording and colour are unit-tested.
export type ResolvedPick = { kind: 'plan'; offer: TierOffer; product: MembershipProduct } | { kind: 'pack'; product: PackProduct }

export function resolvePick(pick: PaywallPick, period: Period, offers: readonly TierOffer[], packs: readonly PackProduct[]): ResolvedPick | null {
  const offer = offers.find(o => {
    const product = period === 'year' ? o.yearly : o.monthly
    return product && (isTierPick(pick) ? o.tier === pick : o.monthly?.id === pick || o.yearly?.id === pick)
  })
  if (offer) return { kind: 'plan', offer, product: productFor(offer, period) }
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

// `paywall_select` (T74, ARCHITECTURE §16.2): what a pick or a Monthly / Yearly switch lands on,
// with the method shown at that moment. Null when the pick resolves to nothing.
export function selectedProduct(
  choice: PaywallChoice,
  patch: Partial<PaywallChoice>,
  offers: readonly TierOffer[],
  packs: readonly PackProduct[],
): { product_id: ResolvedPick['product']['id']; method: PaywallChoice['method'] } | null {
  const next = { ...choice, ...patch }
  const resolved = resolvePick(next.pick, next.period, offers, packs)
  return resolved ? { product_id: resolved.product.id, method: next.method } : null
}
