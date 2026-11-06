import { describe, expect, it } from 'vitest'

import { attachmentFor, isUnread, TICKET_TYPES } from './rules'
import { adminListFilterSchema, adminReplySchema, createTicketSchema, decideRefundSchema } from './schema'

describe('ticket types (ARCHITECTURE §10 「站内工单」)', () => {
  it('keeps the fixed order, refund right after billing', () => {
    expect(TICKET_TYPES).toEqual(['feedback', 'image_issue', 'billing', 'refund', 'account', 'other'])
  })

  it('lets only billing / refund carry a payment and image issues a work', () => {
    expect(TICKET_TYPES.map(attachmentFor)).toEqual(['none', 'work', 'payment', 'payment-required', 'none', 'none'])
  })
})

describe('createTicketSchema', () => {
  const PAYMENT = '42'
  const JOB = '6f0c2d7e-4f6b-4c55-9d8e-0d0a7f3b1a11'

  it('needs a payment for a refund request', () => {
    expect(createTicketSchema.safeParse({ type: 'refund', body: 'x' }).success).toBe(false)
    expect(createTicketSchema.parse({ type: 'refund', body: ' x ', paymentId: PAYMENT })).toEqual({
      type: 'refund',
      body: 'x',
      paymentId: 42,
      jobId: null,
    })
  })

  it('drops attachments the type does not take and reads empty selects as none', () => {
    expect(createTicketSchema.parse({ type: 'feedback', body: 'x', paymentId: PAYMENT, jobId: JOB })).toMatchObject({ paymentId: null, jobId: null })
    expect(createTicketSchema.parse({ type: 'billing', body: 'x', paymentId: '' })).toMatchObject({ paymentId: null })
    expect(createTicketSchema.parse({ type: 'image_issue', body: 'x', jobId: JOB })).toMatchObject({ jobId: JOB })
  })

  it('refuses an unknown type, an empty body and one over 2,000 characters', () => {
    expect(createTicketSchema.safeParse({ type: 'refund_now', body: 'x' }).success).toBe(false)
    expect(createTicketSchema.safeParse({ type: 'other', body: '   ' }).success).toBe(false)
    expect(createTicketSchema.safeParse({ type: 'other', body: 'a'.repeat(2001) }).success).toBe(false)
    expect(createTicketSchema.safeParse({ type: 'other', body: 'a'.repeat(2000) }).success).toBe(true)
  })
})

describe('admin inputs', () => {
  const ticketId = '6f0c2d7e-4f6b-4c55-9d8e-0d0a7f3b1a11'

  it('needs a reply unless closing', () => {
    expect(adminReplySchema.safeParse({ ticketId, body: '', close: false }).success).toBe(false)
    expect(adminReplySchema.safeParse({ ticketId, body: '', close: true }).success).toBe(true)
  })

  it('needs a positive amount to approve and a reply either way', () => {
    expect(decideRefundSchema.safeParse({ ticketId, decision: 'approved', amountCents: 0, body: 'ok' }).success).toBe(false)
    expect(decideRefundSchema.safeParse({ ticketId, decision: 'approved', amountCents: 1991, body: 'ok' }).success).toBe(true)
    expect(decideRefundSchema.safeParse({ ticketId, decision: 'rejected', body: '' }).success).toBe(false)
  })

  it('opens on the open list by default and ignores unknown filters', () => {
    expect(adminListFilterSchema.parse({})).toEqual({ status: 'open', type: undefined })
    expect(adminListFilterSchema.parse({ status: 'nope', type: 'nope' })).toEqual({ status: 'open', type: undefined })
    expect(adminListFilterSchema.parse({ status: 'all', type: 'refund' })).toEqual({ status: 'all', type: 'refund' })
  })
})

describe('isUnread', () => {
  it('is true only when the last message is later than the last look', () => {
    expect(isUnread({ lastMessageAt: '2026-11-06T10:00:01Z', userSeenAt: '2026-11-06T10:00:00Z' })).toBe(true)
    expect(isUnread({ lastMessageAt: '2026-11-06T10:00:00Z', userSeenAt: '2026-11-06T10:00:00Z' })).toBe(false)
  })
})
