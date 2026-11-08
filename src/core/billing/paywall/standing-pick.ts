import { MEMBERSHIP_TIERS, type MembershipTier, type ProductId } from '../../config'
import { heldPeriod } from '../subscription/standing'
import { blockReason, purchaseVerdict, type BlockReason, type MemberStanding } from '../subscription/upgrade-rule'
import type { Period } from './offer'
import { choiceFor, isTierPick, type PaywallOpenOptions } from './use-paywall-state'

// The upgrade rule (T66) as the paywall and /pricing read it, per tier at the chosen period.
// Pure, so every member state is unit-tested.

export function planIdOf(tier: MembershipTier, period: Period): ProductId {
  return `${tier}_${period === 'year' ? 'yearly' : 'monthly'}`
}

// What a tier card shows at this period: open to buy (as an upgrade or not), or locked and why.
export type PlanStanding = { upgrade: boolean; lock: BlockReason | null }

export function planStanding(standing: MemberStanding, tier: MembershipTier, period: Period): PlanStanding {
  const id = planIdOf(tier, period)
  return { upgrade: purchaseVerdict(standing, id) === 'upgrade', lock: blockReason(standing, id) }
}

const otherPeriod = (period: Period): Period => (period === 'year' ? 'month' : 'year')

// Where the paywall opens for a member: the asked-for plan if it can be bought; else the same
// tier at the other period, then the next tiers up (asked period first); else the packs, which
// are always open. With no period asked, a member starts at the period they hold, so a yearly
// member compares yearly plans while everyone else opens on Monthly (DESIGN §4.5).
export function openOptionsFor(options: PaywallOpenOptions, standing: MemberStanding): PaywallOpenOptions {
  const held = heldPeriod(standing)
  const start = options.period === undefined && held !== null ? { ...options, period: held } : options
  const asked = choiceFor(start)
  if (!isTierPick(asked.pick)) return options
  const open = (tier: MembershipTier, period: Period) => purchaseVerdict(standing, planIdOf(tier, period)) !== 'blocked'
  if (open(asked.pick, asked.period)) return start
  const higher = MEMBERSHIP_TIERS.slice(MEMBERSHIP_TIERS.indexOf(asked.pick) + 1)
  const candidates: [MembershipTier, Period][] = [
    [asked.pick, otherPeriod(asked.period)],
    ...higher.flatMap((tier): [MembershipTier, Period][] => [[tier, asked.period], [tier, otherPeriod(asked.period)]]),
  ]
  const found = candidates.find(([tier, period]) => open(tier, period))
  return found ? { ...options, step: 'tiers', tier: found[0], period: found[1] } : { step: 'packs' }
}
