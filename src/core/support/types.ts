import type { TicketStatus, TicketType } from './rules'

// Support ticket data as the app sees it. Rows stay snake_case inside this folder; everything
// exported is camelCase.

export type Page<T> = { items: T[]; nextCursor: string | null }

export type TicketSummary = {
  id: string
  type: TicketType
  status: TicketStatus
  createdAt: string
  lastMessageAt: string
  unread: boolean
}

// An image on a message (T69), as stored: the server signs objectKey into a short-lived URL
// (TicketImage) before anything reaches a browser.
export type TicketAttachment = { id: string; objectKey: string; width: number; height: number }
export type TicketImage = { id: string; url: string; width: number; height: number }

export type TicketMessage = { id: string; author: 'user' | 'admin'; body: string; createdAt: string; attachments: TicketAttachment[] }

// A message as the thread views get it: images signed, keys gone.
export type ShownMessage = Omit<TicketMessage, 'attachments'> & { images: TicketImage[] }

export type TicketThread = TicketSummary & { messages: TicketMessage[] }
export type ShownThread = TicketSummary & { messages: ShownMessage[] }

// What the submit form offers to attach: the author's own payments and works.
export type PaymentOption = { id: string; productId: string; amountTotal: number; currency: string; method: 'card' | 'alipay' | 'cn_card'; createdAt: string }
export type WorkOption = { id: string; templateName: string; createdAt: string }

export type AdminTicketRow = {
  id: string
  userId: string
  email: string | null
  type: TicketType
  status: TicketStatus
  refundDecision: 'approved' | 'rejected' | null
  createdAt: string
  lastMessageAt: string
  preview: string | null
  // The author's tier now (null: none) and when the Owner's reply is due (T27b).
  tier: 'starter' | 'pro' | 'max' | null
  dueAt: string
  overdue: boolean
}

export type AdminPayment = {
  id: string
  productId: string
  channel: 'stripe' | 'waffo'
  stripeSessionId: string | null
  stripeInvoiceId: string | null
  stripeChargeId: string | null
  waffoOrderId: string | null
  // The charge (PAY_…) a Waffo refund is made on; a subscription order has one per period (T50).
  // Null on rows written before T50.
  waffoPaymentId: string | null
  amountTotal: number
  amountTax: number
  amountRefunded: number
  currency: string
  method: string
  status: string
  createdAt: string
}

export type RefundEligibility = {
  firstPurchase: boolean
  within7Days: boolean
  noCreditsUsed: boolean
  suggestedCents: number
}

export type AdminTicket = {
  id: string
  userId: string
  type: TicketType
  status: TicketStatus
  jobId: string | null
  refundDecision: 'approved' | 'rejected' | null
  refundAmountCents: number | null
  createdAt: string
  closedAt: string | null
  messages: TicketMessage[]
  payment: AdminPayment | null
  eligibility: RefundEligibility | null
}

// The admin detail page's ticket once its images are signed (T69).
export type ShownAdminTicket = Omit<AdminTicket, 'messages'> & { messages: ShownMessage[] }
