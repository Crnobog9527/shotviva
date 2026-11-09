import { describe, expect, it } from 'vitest'
import { encodeCursor } from '../cursor'
import { COPY } from './copy'
import { discountState, effects, totals } from './format'
import { reportCursor } from './queries'
import type { CodeRow, RedemptionRow } from './schemas'

const time = '2026-11-09T12:00:00.123456+00:00'
const id = '730f1d83-d2ba-4d38-b9eb-bed499441a73'

describe('campaign reporting', () => {
  it('round-trips a PostgreSQL keyset timestamp and rejects a non-UUID cursor before the SQL cast', () => {
    expect(reportCursor(encodeCursor({ created_at: time, id }))).toEqual({ created_at: time, id })
    expect(reportCursor(encodeCursor({ created_at: time, id: 'wrong' }))).toBeNull()
    expect(reportCursor(encodeCursor({ created_at: '2030-42-99T00:00:00Z', id }))).toBeNull()
  })

  it('keeps earnings and discounts in their own currency and minor unit', () => {
    const money = { usd: { net: -125, discount: 525 }, jpy: { net: 400, discount: 77 } }
    expect(totals(money, 'net')).toBe('JPY ¥400 / USD -$1.25')
    expect(totals(money, 'discount')).toBe('JPY ¥77 / USD $5.25')
  })

  it('shows current configured invite rewards in both unit scales', () => {
    const base = { inviteeCredits: 13, inviterCredits: 21, inviterRewardCap: 34, windowDays: 5 }
    for (const scale of [1, 100]) {
      const invite = { ...base, inviteeCredits: base.inviteeCredits * scale, inviterCredits: base.inviterCredits * scale }
      expect(effects({ kind: 'invite' } as CodeRow, invite)).toEqual([COPY.inviteEffect(invite.inviteeCredits, invite.inviterCredits)])
    }
  })

  it('retains the successful payment after the original discount has expired', () => {
    const row = { status: 'ok', discount_expires_at: time, discount_void_at: null, discount_used_payment_id: 42 } as RedemptionRow
    expect(discountState(row, true, Date.parse(time))).toContain(COPY.payment(42))
    expect(discountState({ ...row, discount_used_payment_id: null }, true, Date.parse(time))).toBe(COPY.expired)
  })
})
