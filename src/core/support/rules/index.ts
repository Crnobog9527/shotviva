// Client-safe ticket rules (ARCHITECTURE §10 「站内工单」), shared by the server, the submit form
// and the admin pages. The SQL functions (0221–0223) enforce the same rules again.

// The order users see them in: one plain list, refund after billing and styled like the rest.
export const TICKET_TYPES = ['feedback', 'image_issue', 'billing', 'refund', 'account', 'other'] as const
export type TicketType = (typeof TICKET_TYPES)[number]

export const TICKET_STATUSES = ['open', 'replied', 'closed'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const BODY_MAX = 2000

// What a type may carry: a payment for billing (optional) and refund (required), a work for
// image issues (optional). Nothing else takes an attachment.
export type Attachment = 'none' | 'payment' | 'payment-required' | 'work'

export function attachmentFor(type: TicketType): Attachment {
  if (type === 'refund') return 'payment-required'
  if (type === 'billing') return 'payment'
  if (type === 'image_issue') return 'work'
  return 'none'
}

export function isTicketType(value: unknown): value is TicketType {
  return typeof value === 'string' && (TICKET_TYPES as readonly string[]).includes(value)
}

// "New reply": the Owner wrote after the author last looked. The author's own messages move
// user_seen_at with them, so only an Owner message can be later (0220).
export function isUnread(ticket: { lastMessageAt: string; userSeenAt: string }): boolean {
  return Date.parse(ticket.lastMessageAt) > Date.parse(ticket.userSeenAt)
}
