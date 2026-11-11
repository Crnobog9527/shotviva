import { describe, expect, it } from 'vitest'

import { attribute } from './attribution'
import type { SourceReads } from './sources'
import { PERIOD } from './test-fixtures'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'

const db = {
  ...PERIOD,
  cohort: [A, B, C],
  cohort_referred: [C],
  buyers: [
    { user_id: A, net_usd: 9.9, orders: 1, referred: false },
    { user_id: C, net_usd: 19.9, orders: 1, referred: true },
    { user_id: D, net_usd: 49.9, orders: 2, referred: false },
  ],
}
const reads: SourceReads = {
  visitors: { search: 19, ai: 2, social: 1, affiliate: 1, ads: 0, direct: 163, other: 1 },
  // C came through Google first, but the database says a promoter brought them.
  firstTouch: { [A]: 'search', [B]: 'direct', [C]: 'search' },
}
const row = (rows: ReturnType<typeof attribute>, key: string) => rows.find((r) => r.key === key)

describe('source attribution', () => {
  const rows = attribute(db, reads)

  it('takes visitors from PostHog per group', () => {
    expect(row(rows, 'search')?.visitors).toBe(19)
    expect(row(rows, 'direct')?.visitors).toBe(163)
  })

  it('credits sign-ups and buyers by their first page view', () => {
    expect(row(rows, 'search')).toMatchObject({ signups: 1, payers: 1, net: 9.9 })
    expect(row(rows, 'direct')).toMatchObject({ signups: 1, payers: 0, net: 0 })
  })

  it('lets the database promoter binding win over PostHog', () => {
    expect(row(rows, 'affiliate')).toMatchObject({ visitors: 1, signups: 1, payers: 1, net: 19.9 })
  })

  it('puts people PostHog never saw under 「认不出来」, and adds that row only when needed', () => {
    expect(row(rows, 'unknown')).toMatchObject({ visitors: null, signups: 0, payers: 1, net: 49.9 })
    const all = attribute({ ...db, buyers: db.buyers.slice(0, 2) }, reads)
    expect(row(all, 'unknown')).toBeUndefined()
  })

  it('without PostHog keeps the promoter row and puts everyone else under 「认不出来」', () => {
    const offline = attribute(db, null)
    expect(row(offline, 'affiliate')).toMatchObject({ visitors: null, signups: 1, payers: 1 })
    expect(row(offline, 'unknown')).toMatchObject({ signups: 2, payers: 2 })
    expect(row(offline, 'search')?.visitors).toBeNull()
  })

  it('adds up to the period totals', () => {
    expect(rows.reduce((sum, r) => sum + r.signups, 0)).toBe(db.cohort.length)
    expect(rows.reduce((sum, r) => sum + r.payers, 0)).toBe(db.buyers.length)
  })
})
