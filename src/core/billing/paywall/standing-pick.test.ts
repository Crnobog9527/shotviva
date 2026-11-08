import { describe, expect, it } from 'vitest'

import { heldPeriod } from '../subscription/standing'
import { NO_STANDING, type MemberStanding } from '../subscription/upgrade-rule'
import { openOptionsFor, planIdOf, planStanding } from './standing-pick'

// How the paywall and /pricing read the upgrade rule (T66) for an existing member.

const starterMonthly: MemberStanding = { subscription: 'starter_monthly', tier: 'starter' }
const maxYearly: MemberStanding = { subscription: 'max_yearly', tier: 'max' }

describe('heldPeriod', () => {
  it('is the period of the subscription held, none for a one-time period or nobody', () => {
    expect(heldPeriod(maxYearly)).toBe('year')
    expect(heldPeriod(starterMonthly)).toBe('month')
    expect(heldPeriod({ subscription: null, tier: 'pro' })).toBeNull()
    expect(heldPeriod(NO_STANDING)).toBeNull()
  })
})

describe('planIdOf', () => {
  it('builds the product id from tier and period', () => {
    expect(planIdOf('pro', 'year')).toBe('pro_yearly')
    expect(planIdOf('starter', 'month')).toBe('starter_monthly')
  })
})

describe('planStanding', () => {
  it('a Starter monthly member: Starter monthly is theirs, everything above says Upgrade', () => {
    expect(planStanding(starterMonthly, 'starter', 'month')).toEqual({ upgrade: false, lock: 'current' })
    expect(planStanding(starterMonthly, 'starter', 'year')).toEqual({ upgrade: true, lock: null })
    expect(planStanding(starterMonthly, 'pro', 'month')).toEqual({ upgrade: true, lock: null })
    expect(planStanding(starterMonthly, 'max', 'year')).toEqual({ upgrade: true, lock: null })
  })

  it('a Pro yearly member: Starter and Pro monthly are lower', () => {
    const pro: MemberStanding = { subscription: 'pro_yearly', tier: 'pro' }
    expect(planStanding(pro, 'starter', 'year').lock).toBe('lower')
    expect(planStanding(pro, 'pro', 'month').lock).toBe('lower')
    expect(planStanding(pro, 'pro', 'year').lock).toBe('current')
    expect(planStanding(pro, 'max', 'month')).toEqual({ upgrade: true, lock: null })
  })

  it('nobody signed in: every plan as before', () => {
    expect(planStanding(NO_STANDING, 'pro', 'year')).toEqual({ upgrade: false, lock: null })
  })
})

describe('openOptionsFor', () => {
  it('keeps what was asked when it can be bought', () => {
    expect(openOptionsFor({ tier: 'pro', period: 'year' }, starterMonthly)).toEqual({ tier: 'pro', period: 'year' })
    expect(openOptionsFor({}, NO_STANDING)).toEqual({})
    expect(openOptionsFor({ step: 'packs', packId: 'pack_s' }, maxYearly)).toEqual({ step: 'packs', packId: 'pack_s' })
  })

  it('moves a locked pick to the same tier at the other period, then up', () => {
    expect(openOptionsFor({ tier: 'starter', period: 'month' }, starterMonthly)).toEqual({ step: 'tiers', tier: 'starter', period: 'year' })
    const proMonthly: MemberStanding = { subscription: 'pro_monthly', tier: 'pro' }
    expect(openOptionsFor({ tier: 'starter', period: 'month' }, proMonthly)).toEqual({ step: 'tiers', tier: 'pro', period: 'year' })
    const proYearly: MemberStanding = { subscription: 'pro_yearly', tier: 'pro' }
    // A yearly member starts at Yearly; Pro yearly is theirs, so Max yearly is the next plan up.
    expect(openOptionsFor({}, proYearly)).toEqual({ step: 'tiers', tier: 'max', period: 'year' })
    // The default (Pro monthly) is theirs: Pro yearly is the step up on the same tier.
    expect(openOptionsFor({}, proMonthly)).toEqual({ step: 'tiers', tier: 'pro', period: 'year' })
  })

  // DESIGN §4.5 「默认显示按月」: everyone opens on Monthly except a member holding a yearly plan.
  it('starts a member at the period they hold when no period is asked', () => {
    const starterYearly: MemberStanding = { subscription: 'starter_yearly', tier: 'starter' }
    expect(openOptionsFor({}, starterYearly)).toEqual({ period: 'year' })
    expect(openOptionsFor({ step: 'period', tier: 'max' }, starterYearly)).toEqual({ step: 'period', tier: 'max', period: 'year' })
    expect(openOptionsFor({}, starterMonthly)).toEqual({ period: 'month' })
    // A one-time period has no interval: Monthly as for everyone.
    expect(openOptionsFor({}, { subscription: null, tier: 'starter' })).toEqual({})
    // A period asked for (the /pricing toggle) wins.
    expect(openOptionsFor({ tier: 'max', period: 'month' }, starterYearly)).toEqual({ tier: 'max', period: 'month' })
  })

  it('opens on the packs when nothing higher is left', () => {
    expect(openOptionsFor({}, maxYearly)).toEqual({ step: 'packs' })
    expect(openOptionsFor({ tier: 'max', period: 'month' }, maxYearly)).toEqual({ step: 'packs' })
  })
})
