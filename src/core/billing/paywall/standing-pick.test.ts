import { describe, expect, it } from 'vitest'

import { NO_STANDING, type MemberStanding } from '../subscription/upgrade-rule'
import { openOptionsFor, planIdOf, planStanding } from './standing-pick'

// How the paywall and /pricing read the upgrade rule (T66) for an existing member.

const starterMonthly: MemberStanding = { subscription: 'starter_monthly', tier: 'starter' }
const maxYearly: MemberStanding = { subscription: 'max_yearly', tier: 'max' }

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
    // The default (Pro yearly) is theirs: Max yearly is the next plan up at the same period.
    expect(openOptionsFor({}, proYearly)).toEqual({ step: 'tiers', tier: 'max', period: 'year' })
  })

  it('opens on the packs when nothing higher is left', () => {
    expect(openOptionsFor({}, maxYearly)).toEqual({ step: 'packs' })
    expect(openOptionsFor({ tier: 'max', period: 'month' }, maxYearly)).toEqual({ step: 'packs' })
  })
})
