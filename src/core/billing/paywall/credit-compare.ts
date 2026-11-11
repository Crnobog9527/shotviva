import type { MembershipProduct, MembershipTier, PackProduct } from '../../config'
import { perCreditUsd, type TierOffer } from './offer'

// When credits run out (T107 「积分不够时，同时对比买积分包和开会员哪个更划算」): the smallest
// pack that covers what is short, beside the cheapest monthly plan that does, and which of the
// two costs less today and per credit. Facts only, both computed from the published catalogue;
// the sheet words the verdict and lets the buyer pick either. Only plans this member can buy
// take part (`buyable`: never their own or a lower plan); with none left, the pack stands alone.
export type ComparedPlan = MembershipProduct & { tier: MembershipTier }

export type CreditCompare =
  | { pack: PackProduct; plan: ComparedPlan; cheaperToday: Cheaper; cheaperPerCredit: Cheaper }
  | { pack: PackProduct; plan: null }

type Cheaper = 'pack' | 'plan' | 'same'

const cheaper = (pack: number, plan: number): Cheaper => (Math.abs(pack - plan) < 1e-9 ? 'same' : pack < plan ? 'pack' : 'plan')

export function compareForNeed(
  needed: number,
  packs: readonly PackProduct[],
  offers: readonly TierOffer[],
  buyable: (tier: MembershipTier) => boolean = () => true,
): CreditCompare | null {
  if (needed <= 0 || packs.length === 0) return null
  const bySize = [...packs].sort((a, b) => a.credits - b.credits)
  const pack = bySize.find((candidate) => candidate.credits >= needed) ?? bySize[bySize.length - 1]!
  const monthly = offers
    .filter((offer) => buyable(offer.tier))
    .flatMap((offer) => (offer.monthly ? [offer.monthly] : []))
    .sort((a, b) => a.priceUsd - b.priceUsd)
  const plan = monthly.find((candidate) => candidate.credits >= needed) ?? monthly[monthly.length - 1]
  if (!plan) return { pack, plan: null }
  return { pack, plan, cheaperToday: cheaper(pack.priceUsd, plan.priceUsd), cheaperPerCredit: cheaper(perCreditUsd(pack), perCreditUsd(plan)) }
}

// Which sentence words the comparison. "Today" (what each costs now) and "per credit" are said
// separately whenever they differ, a tie included: a pack that is cheaper today but costs the
// same per credit must never read as the plan being cheaper per credit.
export type Verdict =
  | 'pack' | 'plan' | 'same'
  | 'packNowPlanLater' | 'planNowPackLater'
  | 'packNowSameRate' | 'planNowSameRate'
  | 'sameNowPackRate' | 'sameNowPlanRate'

export function verdictKey({ cheaperToday, cheaperPerCredit }: { cheaperToday: Cheaper; cheaperPerCredit: Cheaper }): Verdict {
  if (cheaperToday === cheaperPerCredit) return cheaperToday
  if (cheaperPerCredit === 'same') return cheaperToday === 'pack' ? 'packNowSameRate' : 'planNowSameRate'
  if (cheaperToday === 'same') return cheaperPerCredit === 'pack' ? 'sameNowPackRate' : 'sameNowPlanRate'
  return cheaperToday === 'pack' ? 'packNowPlanLater' : 'planNowPackLater'
}
