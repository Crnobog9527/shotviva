import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { customerBonus } = await import('./reads')
const { bonusLabel, sourceLabel } = await import('./customer-copy')

const base = { bonus_credits: null, bonus_at: null, bonus_error: null, level: 1 as const, source: 'org_l1', paid_before: false, has_signup_gift: true }

describe('推广名单 bonus status', () => {
  it('shows a granted bonus first, then a recorded refusal', () => {
    expect(customerBonus({ ...base, bonus_credits: 350, bonus_at: '2026-11-27T00:00:00Z', bonus_error: 'x' })).toEqual({ kind: 'granted', credits: 350, at: '2026-11-27T00:00:00Z' })
    expect(bonusLabel(customerBonus({ ...base, bonus_credits: 350, bonus_at: '2026-11-27T00:00:00Z' }))).toBe('已发 350 积分')
    expect(bonusLabel(customerBonus({ ...base, bonus_error: 'blocked_no_signup_grant' }))).toContain('没领到注册赠送')
    expect(bonusLabel(customerBonus({ ...base, bonus_error: '23505: boom' }))).toBe('发放出错：23505: boom')
  })

  it('infers why nothing was attempted from how the customer was bound', () => {
    expect(customerBonus({ ...base, level: 2, source: 'org_l2' })).toEqual({ kind: 'none', reason: 'level2' })
    expect(customerBonus({ ...base, paid_before: true })).toEqual({ kind: 'none', reason: 'paid_before' })
    expect(customerBonus({ ...base, source: 'first_checkout' })).toEqual({ kind: 'none', reason: 'first_checkout' })
    expect(customerBonus({ ...base, source: 'signup', has_signup_gift: false })).toEqual({ kind: 'none', reason: 'no_signup_gift' })
    expect(customerBonus({ ...base, source: 'signup' })).toEqual({ kind: 'none', reason: 'ref_link' })
    expect(customerBonus(base)).toEqual({ kind: 'none', reason: 'off' })
    expect(customerBonus({ ...base, source: 'invite' })).toEqual({ kind: 'none', reason: 'other' })
  })

  it('names the source of a binding', () => {
    expect(sourceLabel('signup')).toBe('企业推广链接注册')
    expect(sourceLabel('invite')).toBe('其他（invite）')
    expect(sourceLabel(null)).toBe('—')
  })
})
