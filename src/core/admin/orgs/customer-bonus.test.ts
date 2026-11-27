import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { customerBonus } = await import('./reads')
const { bonusLabel, sourceLabel } = await import('./customer-copy')

// A ?ref= customer who qualified at the binding and could be back-filled today.
const base = {
  bonus_credits: null as number | null, bonus_at: null as string | null, bonus_error: null as string | null, level: 1 as 1 | 2,
  source: 'signup' as string | null, paid_before: false, has_signup_gift: true, bonus_at_bind: 350, switch_at_bind: true,
  before_org: false, has_paid: false, banned: false,
}
const reason = (facts: Partial<typeof base>, on = true) => {
  const bonus = customerBonus({ ...base, ...facts }, on)
  return bonus.kind === 'none' ? bonus.reason : bonus.kind
}

describe('推广名单 bonus status', () => {
  it('shows a granted bonus first, then a recorded refusal', () => {
    expect(customerBonus({ ...base, bonus_credits: 350, bonus_at: '2026-11-27T00:00:00Z', bonus_error: 'x' }, true)).toEqual({ kind: 'granted', credits: 350, at: '2026-11-27T00:00:00Z' })
    expect(bonusLabel(customerBonus({ ...base, bonus_credits: 350, bonus_at: '2026-11-27T00:00:00Z' }, true))).toBe('已发 350 积分')
    expect(bonusLabel(customerBonus({ ...base, bonus_error: 'blocked_no_signup_grant' }, true))).toContain('没领到注册赠送')
    expect(bonusLabel(customerBonus({ ...base, bonus_error: '23505: boom' }, true))).toBe('发放出错：23505: boom')
  })

  it('says 可补发 only when the 2010 back-fill would pay', () => {
    expect(reason({})).toBe('backfill')
    expect(bonusLabel(customerBonus(base, true))).toContain('可补发')
    expect(reason({}, false)).toBe('off_now')
    expect(reason({ has_paid: true })).toBe('paid_since')
    expect(reason({ banned: true })).toBe('banned')
  })

  it('gives the bind-time reason for someone who never qualified', () => {
    expect(reason({ before_org: true })).toBe('before_org')
    expect(reason({ bonus_at_bind: 0 })).toBe('off_at_bind')
    expect(reason({ switch_at_bind: false })).toBe('affiliate_off_at_bind')
    expect(reason({ has_signup_gift: false })).toBe('no_signup_gift')
    for (const r of ['before_org', 'off_at_bind', 'affiliate_off_at_bind', 'no_signup_gift'] as const) {
      expect(bonusLabel({ kind: 'none', reason: r })).not.toContain('可补发')
    }
  })

  it('covers the other bindings', () => {
    expect(reason({ level: 2, source: 'org_l2' })).toBe('level2')
    expect(reason({ paid_before: true })).toBe('paid_before')
    expect(reason({ source: 'first_checkout' })).toBe('first_checkout')
    expect(reason({ source: 'invite' })).toBe('other')
    expect(reason({ source: 'org_l1', bonus_at_bind: 0 })).toBe('off_at_bind')
    expect(reason({ source: 'org_l1' })).toBe('unrecorded')
  })

  it('names the source of a binding', () => {
    expect(sourceLabel('signup')).toBe('企业推广链接注册')
    expect(sourceLabel('invite')).toBe('其他（invite）')
    expect(sourceLabel(null)).toBe('—')
  })
})
