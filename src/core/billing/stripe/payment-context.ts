import 'server-only'

import type Stripe from 'stripe'
import { z } from 'zod'

import { callRpc, type RpcClient } from '../rpc'
import { BUYER_META } from './checkout-evidence'

// After settle_checkout (T82): copy the checkout context onto the payment row
// (record_payment_context, 0721; first write wins, so a redelivery changes nothing). The IP and
// browser are the ones checkout put in the session's metadata; Terms consent is Checkout's
// required box. Stripe gives no consent time: the box is ticked before paying, so the time the
// payment settles is recorded (at or after the acceptance).

const ip = z.union([z.ipv4(), z.ipv6()])

export function contextOf(session: Stripe.Checkout.Session, now: Date) {
  const meta = session.metadata ?? {}
  const address = ip.safeParse(meta[BUYER_META.ip])
  const agent = meta[BUYER_META.userAgent]
  return {
    p_session_id: session.id,
    p_ip: address.success ? address.data : null,
    p_user_agent: agent && agent.length > 0 ? agent : null,
    p_terms_accepted_at: session.consent?.terms_of_service === 'accepted' ? now.toISOString() : null,
    p_managed_payments: session.managed_payments?.enabled ?? false,
  }
}

export async function recordPaymentContext(db: RpcClient, session: Stripe.Checkout.Session, now = new Date()): Promise<boolean> {
  return callRpc(db, 'record_payment_context', contextOf(session, now), z.boolean())
}
