import { describe, expect, it } from 'vitest'

import { attribute, isEmptyLine } from './attribution'
import type { SourceReads } from './sources'
import { PERIOD } from './test-fixtures'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'
const E = '55555555-5555-4555-8555-555555555555'

const db = {
  ...PERIOD,
  cohort: [A, B, C, E],
  cohort_referred: [C],
  buyers: [
    { user_id: A, net_usd: 9.9, orders: 1, referred: false },
    { user_id: C, net_usd: 19.9, orders: 1, referred: true },
    { user_id: D, net_usd: 49.9, orders: 2, referred: false },
    { user_id: E, net_usd: 30, orders: 1, referred: false },
  ],
}
const reads: SourceReads = {
  visitors: { 'search:google': 12, 'search:bing': 8, 'ai:chatgpt': 4, 'social:producthunt': 8, affiliate: 1, direct: 163, other: 7, 'ads:google': 4 },
  // C came through Google first, but the database says a promoter brought them.
  firstTouch: { [A]: 'search:google', [B]: 'direct', [C]: 'search:google', [E]: 'ai:chatgpt' },
  truncated: false,
}
const top = (rows: ReturnType<typeof attribute>, key: string) => rows.find((r) => r.key === key)
const child = (rows: ReturnType<typeof attribute>, group: string, key: string) => top(rows, group)?.children.find((c) => c.key === key)

describe('source attribution', () => {
  const rows = attribute(db, reads)

  it('shows each source under its group, with PostHog visitors', () => {
    expect(child(rows, 'search', 'search:google')?.visitors).toBe(12)
    expect(child(rows, 'search', 'search:bing')?.visitors).toBe(8)
    expect(child(rows, 'ai', 'ai:chatgpt')).toMatchObject({ visitors: 4, signups: 1, payers: 1, net: 30 })
    expect(child(rows, 'social', 'social:producthunt')?.visitors).toBe(8)
    expect(child(rows, 'ads', 'ads:google')?.visitors).toBe(4)
  })

  it('adds a group up from its sources', () => {
    expect(top(rows, 'search')).toMatchObject({ visitors: 20, signups: 1, payers: 1, net: 9.9 })
    expect(top(rows, 'ai')?.visitors).toBe(4)
  })

  it('lists every known source of a group, zeros included, ending with 其他…', () => {
    const search = top(rows, 'search')!.children.map((c) => c.key)
    expect(search[0]).toBe('search:google')
    expect(search.at(-1)).toBe('search:other')
    expect(child(rows, 'search', 'search:baidu')).toMatchObject({ visitors: 0, signups: 0 })
    expect(isEmptyLine(child(rows, 'search', 'search:baidu')!)).toBe(true)
  })

  it('lets the database promoter binding win over PostHog', () => {
    expect(top(rows, 'affiliate')).toMatchObject({ visitors: 1, signups: 1, payers: 1, net: 19.9, children: [] })
  })

  it('puts people PostHog never saw under 「认不出来」, and adds that row only when needed', () => {
    expect(top(rows, 'unknown')).toMatchObject({ visitors: null, signups: 0, payers: 1, net: 49.9 })
    expect(top(attribute({ ...db, buyers: db.buyers.filter((b) => b.user_id !== D) }, reads), 'unknown')).toBeUndefined()
  })

  it('without PostHog keeps the promoter row and puts everyone else under 「认不出来」', () => {
    const offline = attribute(db, null)
    expect(top(offline, 'affiliate')).toMatchObject({ visitors: null, signups: 1, payers: 1 })
    expect(top(offline, 'unknown')).toMatchObject({ signups: 3, payers: 3 })
    expect(top(offline, 'search')?.visitors).toBeNull()
    expect(child(offline, 'search', 'search:google')?.visitors).toBeNull()
  })

  it('adds up to the period totals', () => {
    expect(rows.reduce((total, r) => total + r.signups, 0)).toBe(db.cohort.length)
    expect(rows.reduce((total, r) => total + r.payers, 0)).toBe(db.buyers.length)
    const visitorTotal = rows.reduce((total, r) => total + (r.visitors ?? 0), 0)
    expect(visitorTotal).toBe(Object.values(reads.visitors).reduce((a, b) => a + b, 0))
  })
})
