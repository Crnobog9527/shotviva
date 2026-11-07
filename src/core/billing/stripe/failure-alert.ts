import type Stripe from 'stripe'
import { z } from 'zod'

import type { PaymentFailedAlert, PaymentStep } from '../../alerts'

// The Owner's 「付款没到账」 alert when a Stripe event fails to process (T72). Only what the signed
// event body already says: no Stripe call on a path that is already failing. Absent fields
// leave the sentence shorter, never wrong.

const STEPS: Record<string, PaymentStep> = {
  'checkout.session.completed': 'purchase',
  'checkout.session.async_payment_succeeded': 'purchase',
  'invoice.paid': 'renewal',
  'customer.subscription.updated': 'subscription',
  'customer.subscription.deleted': 'subscription',
  'charge.refunded': 'refund',
  'charge.dispute.created': 'dispute',
  'charge.dispute.closed': 'dispute',
}

// Our checkout metadata: on the session itself, and on a renewal invoice through its subscription.
const metadataSchema = z.object({ user_id: z.string().optional(), product_id: z.string().optional() }).nullish()

const objectSchema = z.object({
  amount_total: z.number().int().nullish(),
  amount_paid: z.number().int().nullish(),
  currency: z.string().nullish(),
  metadata: metadataSchema,
  parent: z.object({ subscription_details: z.object({ metadata: metadataSchema }).nullish() }).nullish(),
})

type EventObject = z.infer<typeof objectSchema>

const isGrant = (step: PaymentStep) => step === 'purchase' || step === 'renewal'

// An invoice carries its own (empty) metadata; ours sits on the subscription.
function ourMetadata(object: EventObject) {
  if (object.metadata?.product_id) return object.metadata
  return object.parent?.subscription_details?.metadata ?? {}
}

function grantFacts(object: EventObject): Pick<PaymentFailedAlert, 'userId' | 'productId' | 'amount'> {
  const { user_id = null, product_id = null } = ourMetadata(object)
  const cents = object.amount_total ?? object.amount_paid
  const amount = typeof cents === 'number' && object.currency ? { cents, currency: object.currency } : null
  return { userId: user_id, productId: product_id, amount }
}

export function stripeFailureAlert(event: Pick<Stripe.Event, 'id' | 'type' | 'data'>): PaymentFailedAlert {
  const step = STEPS[event.type] ?? 'other'
  const parsed = objectSchema.safeParse(event.data.object)
  const facts = parsed.success && isGrant(step) ? grantFacts(parsed.data) : { userId: null, productId: null, amount: null }
  return { kind: 'payment_failed', channel: 'stripe', eventId: event.id, step, ...facts }
}
