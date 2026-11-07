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

export type DisputeOpenedAlert = PaymentFacts & { kind: 'dispute_opened'; disputeId: string; credits: Clawback | null }

// charge.dispute.closed (T71 wires it): won → the clawed-back credits are given back.
export type DisputeClosedAlert = PaymentFacts & { kind: 'dispute_closed'; disputeId: string; won: boolean; creditsReturned: number | null }

export type PaymentFailedAlert = PaymentFacts & { kind: 'payment_failed'; channel: AlertChannel; eventId: string; step: PaymentStep }

export type GenerationSpikeAlert = { kind: 'generation_spike'; failed: number; total: number; windowMinutes: number; hour: string }

// A user's new ticket (messageId null) or their follow-up message on one. ticketType null on a
// follow-up: the notifier reads it.
export type TicketAlert = { kind: 'ticket'; ticketId: string; messageId: string | null; userId: string; ticketType: string | null }

// T66: an upgrade was paid but an old subscription would not cancel. productId null: the old
// subscriptions could not even be read.
export type CancelFailedAlert = {
  kind: 'subscription_cancel_failed'
  userId: string
  channel: AlertChannel | null
  productId: string | null
  subscriptionRef: string | null
}

export type OwnerAlert =
  | RefundAlert
  | DisputeOpenedAlert
  | DisputeClosedAlert
  | PaymentFailedAlert
  | GenerationSpikeAlert
  | TicketAlert
  | CancelFailedAlert

export type OwnerAlertKind = OwnerAlert['kind']

const KEYS: { [K in OwnerAlertKind]: (alert: Extract<OwnerAlert, { kind: K }>) => string } = {
  // Keyed by the refunded total, so a second partial refund on the same charge is a new message.
  refund: (a) => `refund:${a.channel}:${a.refundId}:${a.refunded?.cents ?? ''}`,
  dispute_opened: (a) => `dispute_opened:${a.disputeId}`,
  dispute_closed: (a) => `dispute_closed:${a.disputeId}`,
  payment_failed: (a) => `payment_failed:${a.channel}:${a.eventId}`,
  generation_spike: (a) => `generation_spike:${a.hour}`,
  ticket: (a) => `ticket:${a.ticketId}:${a.messageId ?? 'new'}`,
  subscription_cancel_failed: (a) => `subscription_cancel_failed:${a.userId}:${a.subscriptionRef ?? 'read'}`,
}

// One message per fact: a redelivered webhook, a retried handler or a second instance builds
// the same key, and the dedupe drops it.
export function dedupeKey(alert: OwnerAlert): string {
  return (KEYS[alert.kind] as (a: OwnerAlert) => string)(alert)
}
