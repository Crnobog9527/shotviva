import { describe, expect, it } from 'vitest'

import { PAGE_SIZE, filterMembers, sortMembers, toggleOpen } from './member-selection'

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

describe('sortMembers', () => {
  it('puts the owner first, then accounts by name, unreadable accounts last', () => {
    const owner = { ...m('zed@acme.test', '2026-11-01T00:00:00Z'), role: 'owner' as const }
    const list = [m('bob@acme.test', '2026-11-15T08:00:00Z'), { ...m('x', '2026-11-16T00:00:00Z'), account: null }, owner, m('Ann@acme.test', '2026-11-02T08:00:00Z')]
    expect(sortMembers(list).map((x) => x.account)).toEqual(['zed@acme.test', 'Ann@acme.test', 'bob@acme.test', null])
  })
})

describe('one editor open at a time', () => {
  it('opening another row replaces the open one; tapping the open row closes it', () => {
    let open: string | null = null
    open = toggleOpen(open, 'a')
    expect(open).toBe('a')
    open = toggleOpen(open, 'b')
    expect(open).toBe('b')
    open = toggleOpen(open, 'b')
    expect(open).toBeNull()
  })
})

describe('search outside selection mode', () => {
  it('filters the sorted list by account without selection mode being involved', () => {
    const many = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => m(`user${String(i).padStart(2, '0')}@acme.test`, '2026-11-02T08:00:00Z', `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`))
    const found = filterMembers(sortMembers(many), { query: 'user33', joinedFrom: '' })
    expect(found.map((x) => x.account)).toEqual(['user33@acme.test'])
    expect(many.length).toBeGreaterThan(PAGE_SIZE)
  })
})
