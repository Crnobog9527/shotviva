import { describe, expect, it } from 'vitest'

import { batchDay, classifyStripeFee, matchBatch, shareOut } from './batches'

// F4: Stripe's unattributed fee batches, matched from the amount alone (F1 §2.2).
const pay = (...bases: (number | null)[]) => bases.map((basis_cents, i) => ({ payment_id: i + 1, basis_cents }))
const shares = (m: ReturnType<typeof matchBatch>) => (m.status === 'allocated' ? m.items.map(i => `${i.payment_id}:${i.share_cents}`) : m.status)

describe('classifyStripeFee / batchDay', () => {
  it('knows the three per-order kinds, dispute fees, and flags anything else', () => {
    expect(classifyStripeFee('Managed Payments Transaction Fee (2026-11-10)')).toEqual({ kind: 'mp', known: true })
    expect(classifyStripeFee('Billing - Usage Fee (2026-11-10)')).toEqual({ kind: 'billing', known: true })
    expect(classifyStripeFee('Radar for Fraud Teams (2026-11-10)')).toEqual({ kind: 'radar', known: true })
    expect(classifyStripeFee('Card Dispute Countered Fee (2026-11-10)')).toEqual({ kind: 'other', known: true })
    expect(classifyStripeFee('Something new')).toEqual({ kind: 'other', known: false })
    expect(classifyStripeFee(null)).toEqual({ kind: 'other', known: false })
  })
  it('takes the UTC day from the description, else the booking day', () => {
    expect(batchDay('Managed Payments Transaction Fee (2026-11-10)', new Date('2026-11-11T02:00:00Z'))).toBe('2026-11-10')
    expect(batchDay('no date', new Date('2026-11-11T02:00:00Z'))).toBe('2026-11-11')
  })
})

describe('matchBatch', () => {
  it('MP: rounds the batch total, not each payment ($9.90 + $19.90 → 104¢), and shares it by amount', () => {
    const m = matchBatch('mp', 104, pay(990, 1990))
    expect(m).toMatchObject({ status: 'allocated', formula_cents: 104 })
    expect(shares(m)).toEqual(['1:35', '2:69'])
  })
  it('MP: the shortest run of the oldest payments that explains the batch (several batches a day)', () => {
    // round(3.5% × 990) = 35; a later batch takes the rest.
    expect(shares(matchBatch('mp', 35, pay(990, 1990, 4990)))).toEqual(['1:35'])
  })
  it('MP: within a cent per payment of the formula, all of them; beyond that a mismatch', () => {
    expect(shares(matchBatch('mp', 106, pay(990, 1990)))).toEqual(['1:35', '2:71'])
    expect(matchBatch('mp', 140, pay(990, 1990))).toMatchObject({ status: 'mismatch', formula_cents: 104 })
    expect(matchBatch('mp', 35, [])).toMatchObject({ status: 'mismatch' })
    expect(matchBatch('mp', 35, pay(null))).toMatchObject({ status: 'mismatch', formula_cents: null })
  })
  it('MP: payments an earlier batch left unexplained, or a non-USD one, never block the next batch', () => {
    // #1 ($49.90) belonged to a batch nothing explained; the next batch is #2 + #3.
    expect(shares(matchBatch('mp', 104, pay(4990, 990, 1990)))).toEqual(['2:35', '3:69'])
    expect(shares(matchBatch('mp', 104, pay(990, null, 990, 1990)))).toEqual(['3:35', '4:69'])
    // A run never spans the non-USD payment.
    expect(matchBatch('mp', 140, pay(990, null, 3010))).toMatchObject({ status: 'mismatch' })
  })
  it('a run starts on the label day; only its tail may cross midnight', () => {
    const day = (onDay: boolean, basis: number, id: number) => ({ payment_id: id, basis_cents: basis, onDay })
    // Crossing midnight: #1 on the day, #2 the next day.
    expect(shares(matchBatch('mp', 104, [day(true, 990, 1), day(false, 1990, 2)]))).toEqual(['1:35', '2:69'])
    // The only exact run lies entirely on the next day: a mismatch, not the next day's payment.
    expect(matchBatch('mp', 35, [day(true, 4990, 1), day(false, 990, 2)])).toMatchObject({ status: 'mismatch' })
    expect(matchBatch('mp', 35, [day(false, 990, 2)])).toMatchObject({ status: 'mismatch', note: 'no payments that day' })
    // Radar counts the label day's orders only.
    expect(shares(matchBatch('radar', 15, [day(true, 990, 1), day(false, 990, 2)]))).toEqual(['1:5'])
  })
  it('Billing 0.7% the same way', () => {
    expect(shares(matchBatch('billing', 35, pay(4990)))).toEqual(['1:35'])
  })
  it('Radar: 5¢ per order; the excess is failed attempts (platform); a smaller multiple covers the oldest', () => {
    expect(matchBatch('radar', 15, pay(990, 1990))).toMatchObject({ status: 'allocated', formula_cents: 10 })
    expect(shares(matchBatch('radar', 15, pay(990, 1990)))).toEqual(['1:5', '2:5'])
    expect(shares(matchBatch('radar', 5, pay(990, 1990)))).toEqual(['1:5'])
    expect(matchBatch('radar', 7, pay(990, 1990))).toMatchObject({ status: 'mismatch' })
    expect(shares(matchBatch('radar', 10, pay(null, 990)))).toEqual(['1:5', '2:5'])
  })
})

describe('shareOut', () => {
  it('adds up exactly, largest remainder first', () => {
    const out = shareOut(100, [{ payment_id: 1, basis_cents: 1 }, { payment_id: 2, basis_cents: 1 }, { payment_id: 3, basis_cents: 1 }])
    expect(out.map(o => o.share_cents)).toEqual([34, 33, 33])
    expect(shareOut(7, [{ payment_id: 1, basis_cents: 0 }, { payment_id: 2, basis_cents: 0 }]).map(o => o.share_cents)).toEqual([4, 3])
  })
})
