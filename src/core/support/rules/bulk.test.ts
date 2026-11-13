import { describe, expect, it } from 'vitest'

import { bulkTicketSkip, type BulkTicketFacts } from './bulk'

const open: BulkTicketFacts = { status: 'open', type: 'feedback', refundDecided: false, renewalPending: false }

describe('which tickets a batch leaves alone', () => {
  it('takes open and answered tickets', () => {
    expect(bulkTicketSkip(open, true)).toBeNull()
    expect(bulkTicketSkip({ ...open, status: 'replied' }, false)).toBeNull()
  })

  it('skips missing and closed tickets, for a reply as well as a close', () => {
    expect(bulkTicketSkip(undefined, true)).toBe('missing')
    expect(bulkTicketSkip({ ...open, status: 'closed' }, false)).toBe('closed')
  })

  it('never answers or closes a refund request that has no decision yet', () => {
    const refund = { ...open, type: 'refund' as const }
    expect(bulkTicketSkip(refund, true)).toBe('refund_undecided')
    expect(bulkTicketSkip(refund, false)).toBe('refund_undecided')
    expect(bulkTicketSkip({ ...refund, refundDecided: true }, true)).toBeNull()
  })

  it('closes no billing ticket whose renewal is still to check, but can reply to it', () => {
    const billing = { ...open, type: 'billing' as const, renewalPending: true }
    expect(bulkTicketSkip(billing, true)).toBe('renewal_pending')
    expect(bulkTicketSkip(billing, false)).toBeNull()
  })
})
