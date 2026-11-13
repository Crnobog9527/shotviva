import type { InquiryUse, MonthlyVolume } from '../inquiries/rules'

// What notifyOwner is told (ARCHITECTURE §16.4, T72): facts only, ids and amounts. The notifier
// looks up who the user is (masked) and renders the Chinese text; call sites never write copy.

export type AlertChannel = 'stripe' | 'waffo'

// Amounts in the currency's minor unit, as payments stores them.
export type Money = { cents: number; currency: string }

// Credits taken back for a refunded or disputed payment (T71): totals on the payment row. null
// while T71 has not reported them; the message then says 「积分处理见后台」.
export type Clawback = { clawedBack: number; shortfall: number }

// Which kind of payment callback failed: a grant (purchase / renewal) means money is not credited.
export type PaymentStep = 'purchase' | 'renewal' | 'subscription' | 'refund' | 'dispute' | 'other'

type PaymentFacts = { userId: string | null; productId: string | null; amount: Money | null }

export type RefundAlert = PaymentFacts & {
  kind: 'refund'
  channel: AlertChannel
  // Stripe: the charge id; Waffo: the refund event id.
  refundId: string
  refunded: Money | null
  credits: Clawback | null
  // Waffo's event names the payment only; the notifier reads user, product and amount from it.
  waffoPaymentId?: string | null
}

// T82: what the dispute flow adds once the evidence is staged: the deadline (ISO, null when the
// bank takes no response), who answers (us, or Stripe for Managed Payments), the automatic ban, and
// whether the draft reached Stripe: 'failed' is retried on Stripe's redelivery, but the Owner is told
// now, since this alert is sent once; 'skipped' means Stripe no longer takes evidence.
export type DisputeEvidenceFacts = {
  dueBy: string | null
  responder: 'shotviva' | 'stripe'
  autoBanned: boolean
  draft: 'staged' | 'failed' | 'skipped'
}

export type DisputeOpenedAlert = PaymentFacts & { kind: 'dispute_opened'; disputeId: string; credits: Clawback | null; evidence?: DisputeEvidenceFacts }

// T82: the one reminder, three days before the deadline, while evidence we must submit is unsent.
export type DisputeDueSoonAlert = PaymentFacts & { kind: 'dispute_due_soon'; disputeId: string; dueBy: string }

// charge.dispute.closed (T71 wires it): won → the clawed-back credits are given back.
export type DisputeClosedAlert = PaymentFacts & { kind: 'dispute_closed'; disputeId: string; won: boolean; creditsReturned: number | null }

export type PaymentFailedAlert = PaymentFacts & { kind: 'payment_failed'; channel: AlertChannel; eventId: string; step: PaymentStep }

export type GenerationSpikeAlert = { kind: 'generation_spike'; failed: number; total: number; windowMinutes: number }

// A user's new ticket, or their follow-up on one (reply). The notifier fills ticketType for a
// follow-up and pending: the user's messages since the Owner last answered.
export type TicketAlert = {
  kind: 'ticket'
  ticketId: string
  reply: boolean
  userId: string
  ticketType: string | null
  pending: number | null
}

// T66: an upgrade was paid but an old subscription would not cancel. productId null: the old
// subscriptions could not even be read. T71: cause 'refund', a refunded membership's own
// subscription would not cancel (absent: an upgrade).
export type CancelFailedAlert = {
  kind: 'subscription_cancel_failed'
  userId: string
  channel: AlertChannel | null
  productId: string | null
  subscriptionRef: string | null
  cause?: 'upgrade' | 'refund'
}

// T86 (ARCHITECTURE §10.c): someone sent the pricing page's business inquiry form. Company,
// volume and uses only: the email and phone stay in the admin.
export type BusinessInquiryAlert = {
  kind: 'business_inquiry'
  inquiryId: string
  company: string
  volume: MonthlyVolume
  uses: readonly InquiryUse[]
}

// Where on the site a server error happened, for 「网站报错异常」.
export type ErrorArea = 'payment' | 'auth' | 'generate' | 'admin' | 'site'

// More server errors than usual in the last few minutes (Sentry has the details).
export type SiteErrorsAlert = {
  kind: 'site_errors'
  total: number
  byArea: Partial<Record<ErrorArea, number>>
  // The first error still in the window (ISO).
  since: string
  // What crossed the line: payments or sign-in on their own, or the total.
  trigger: ErrorArea | 'total'
  windowMinutes: number
  sentryUrl: string
}

export type RenewalReviewAlert = {
  kind: 'waffo_renewal_review'
  paymentId: string
  duplicate: boolean
  ticketId: string
  orderId: string
  period: number
  quoted: number
  charged: number | null
  tax: number
  currency: string | null
}

// 1295 (ARCHITECTURE §6.1): published web templates missing from the catalogue, most often because
// the 1K price is below the route's cost floor. fingerprint names the set (ids and reasons), so
// the Owner hears once per change and again daily while it lasts. examples: the first few, with
// what the floor rests on (the p95 of how many jobs, or an estimate).
export type SaleFloorReason = 'sale_closed' | 'unpriced' | 'no_route' | 'route_unsupported' | 'below_floor'
export type SaleFloorExample = {
  templateId: string
  reason: SaleFloorReason
  quality: string
  price: number | null
  floor: number | null
  basis: 'p95' | 'estimate' | 'catalog' | 'list' | null
  samples: number | null
}
export type SaleFloorHiddenAlert = {
  kind: 'sale_floor_hidden'
  fingerprint: string
  total: number
  belowFloor: number
  examples: SaleFloorExample[]
}

// 1350 (ARCHITECTURE §7): the signup gift's daily cap is half used ('half') or used up ('full').
// day is the Beijing date the cap counts; one message per day and level.
export type SignupGiftCapAlert = { kind: 'signup_gift_cap'; day: string; level: 'half' | 'full'; granted: number; cap: number }

export type OwnerAlert =
  | { kind: 'template_fallback'; templateId: string; reason: string; rejected: boolean }
  | { kind: 'checkout_catalog_failed'; code: string }
  | { kind: 'catalog_publish_failed'; request: string; step: string }
  | RenewalReviewAlert
  | RefundAlert
  | DisputeOpenedAlert
  | DisputeClosedAlert
  | DisputeDueSoonAlert
  | PaymentFailedAlert
  | GenerationSpikeAlert
  | TicketAlert
  | CancelFailedAlert
  | SiteErrorsAlert
  | BusinessInquiryAlert
  | SaleFloorHiddenAlert
  | SignupGiftCapAlert
  // T108 (ARCHITECTURE §9 第 8 条): a visitor reported a work shown in the public gallery.
  | { kind: 'work_reported'; jobId: string; reason: string }

export type OwnerAlertKind = OwnerAlert['kind']

const MINUTE = 60_000

// How a kind is sent (ARCHITECTURE §16.4; control review 2026-11-08):
// - key: one message per key. With cooldownMs the key can fire again once that long has passed
//   since it last fired (a sliding window, kept in the R2 mark); without, never again.
// - budget: ticket alerts share an hourly cap, so a burst of tickets or replies can never flood
//   the group or use up Feishu's own rate limit; business inquiries have their own (T86).
// - money: refunds, disputes and payments that did not land are never capped, are tried even
//   while sending is backing off, and are retried when Feishu says it is rate limiting.
export type AlertPolicy = { key: string; cooldownMs?: number; requireShared?: boolean; budget?: AlertBudget; money: boolean }
export type AlertBudget = 'tickets' | 'inquiries' | 'reports'

const POLICIES: { [K in OwnerAlertKind]: (alert: Extract<OwnerAlert, { kind: K }>) => AlertPolicy } = {
  // Keyed by the refunded total, so a second partial refund on the same charge is a new message.
  refund: (a) => ({ key: `refund:${a.channel}:${a.refundId}:${a.refunded?.cents ?? ''}`, money: true }),
  dispute_opened: (a) => ({ key: `dispute_opened:${a.disputeId}`, money: true }),
  dispute_closed: (a) => ({ key: `dispute_closed:${a.disputeId}`, money: true }),
  dispute_due_soon: (a) => ({ key: `dispute_due_soon:${a.disputeId}`, money: true }),
  waffo_renewal_review: (a) => ({ key: `waffo_renewal:${a.paymentId}`, money: true }),
  payment_failed: (a) => ({ key: `payment_failed:${a.channel}:${a.eventId}`, money: true }),
  catalog_publish_failed: a => ({ key: `catalog_publish:${a.request}:${a.step}`, requireShared: true, money: false }),
  checkout_catalog_failed: a => ({ key: `checkout_catalog_failed:${a.code}`, cooldownMs: 60 * MINUTE, requireShared: true, money: false }),
  template_fallback: a => ({ key: `template_fallback:${a.templateId}:${a.reason}:${a.rejected}`, cooldownMs: 60 * MINUTE, requireShared: true, money: false }),
  generation_spike: () => ({ key: 'generation_spike', cooldownMs: 60 * MINUTE, money: false }),
  // A new ticket once; replies at most once per ticket per 30 minutes, counted when sent.
  ticket: (a) =>
    a.reply
      ? { key: `ticket_reply:${a.ticketId}`, cooldownMs: 30 * MINUTE, budget: 'tickets', money: false }
      : { key: `ticket:${a.ticketId}`, budget: 'tickets', money: false },
  subscription_cancel_failed: (a) => ({ key: `subscription_cancel_failed:${a.userId}:${a.subscriptionRef ?? 'read'}`, money: false }),
  site_errors: () => ({ key: 'site_errors', cooldownMs: 30 * MINUTE, money: false }),
  business_inquiry: (a) => ({ key: `business_inquiry:${a.inquiryId}`, budget: 'inquiries', money: false }),
  // One message per work per hour however many people report it; the review page has them all.
  // Once per hidden set; a set that lasts is reported again a day later.
  sale_floor_hidden: (a) => ({ key: `sale_floor_hidden:${a.fingerprint}`, cooldownMs: 24 * 60 * MINUTE, requireShared: true, money: false }),
  work_reported: (a) => ({ key: `work_reported:${a.jobId}`, cooldownMs: 60 * MINUTE, budget: 'reports', money: false }),
  signup_gift_cap: (a) => ({ key: `signup_gift_cap:${a.day}:${a.level}`, money: false }),
}

// A redelivered webhook, a retried handler or a second instance builds the same key.
export function alertPolicy(alert: OwnerAlert): AlertPolicy {
  return (POLICIES[alert.kind] as (a: OwnerAlert) => AlertPolicy)(alert)
}
