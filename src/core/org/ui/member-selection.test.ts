import { describe, expect, it } from 'vitest'

import { filterMembers } from './member-selection'

const m = (account: string, joinedAt: string, userId = '00000000-0000-4000-8000-' + account.length.toString().padStart(12, '0')) =>
  ({ userId, account, role: 'member' as const, monthlyAllowance: 0, heldCredits: 0, promoAllowance: 0, heldPromoCredits: 0, paidFollowsDefault: true, promoFollowsDefault: true, paidUnset: true, promoUnset: true, customers: 0, joinedAt })

describe('filterMembers', () => {
  const list = [m('ann@acme.test', '2026-11-02T08:00:00Z'), m('bob@acme.test', '2026-11-15T08:00:00Z'), m('+86138****', '2026-11-20T08:00:00Z')]
  it('matches the account text, case-insensitive', () => {
    expect(filterMembers(list, { query: 'BOB', joinedFrom: '' }).map((x) => x.account)).toEqual(['bob@acme.test'])
    expect(filterMembers(list, { query: '', joinedFrom: '' })).toHaveLength(3)
  })
  it('keeps members who joined on or after the date (UTC)', () => {
    expect(filterMembers(list, { query: '', joinedFrom: '2026-11-15' }).map((x) => x.account)).toEqual(['bob@acme.test', '+86138****'])
    expect(filterMembers(list, { query: 'acme', joinedFrom: '2026-11-15' }).map((x) => x.account)).toEqual(['bob@acme.test'])
  })
})
