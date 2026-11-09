import 'server-only'

import type Stripe from 'stripe'
import { z } from 'zod'

import { AppError } from '../../errors'
import { callRpc } from '../rpc'
import { fulfilCheckoutSession, readPurchase, type FulfilDeps, type FulfilOutcome } from './fulfil'
import { SESSION_EXPAND } from './payment-facts'
import { subscriptionState } from './settle'
import { syncSubscription, type SyncOutcome } from './subscription-sync'

// Admin replay by Stripe id (ARCHITECTURE §10「按 Stripe id 重放入账」, T26): when a webhook
// never arrived, the Owner pastes the cs_… or sub_… and the server does what the webhook would
// have done, through the very same functions:
//   cs_…   retrieve the session, require payment_status = 'paid', then fulfilCheckoutSession →
//          settle_checkout keyed by the session id, so replay and webhook settle once whichever
//          comes first;
//   sub_…  retrieve the subscription, then syncSubscription → sync_subscription, which only
//          updates an existing mirror row (credits and paid_until untouched).
// previewReplay reads only; applyReplay writes, after the Owner confirmed the preview.
// "Already settled" / "mirrored" come from admin_lookup (0182), which finds a session through
// payments or its ledger key and a subscription through its mirror row.

export type ReplayPreview =
  | {
      kind: 'checkout'
      id: string
      userId: string
      productId: string
      credits: number | null
      amountTotal: number | null
      currency: string | null
      settled: boolean
    }
  | {
      kind: 'subscription'
      id: string
      userId: string
      productId: string
      status: Stripe.Subscription.Status
      periodEnd: string
      cancelAtPeriodEnd: boolean
      mirrored: boolean
    }

export type ReplayOutcome = FulfilOutcome | SyncOutcome

export const REPLAY_ERRORS = {
  format: 'NOT_A_STRIPE_ID',
  unpaid: 'SESSION_NOT_PAID',
} as const

const idSchema = z.string().trim().regex(/^(cs|sub)_[A-Za-z0-9_]{6,250}$/)
const ownerSchema = z.object({ user_id: z.uuid(), product_id: z.string().min(1) })
const lookupRows = z.array(z.object({ user_id: z.uuid() })).max(1)

function parseId(raw: unknown): string {
  const parsed = idSchema.safeParse(raw)
  if (!parsed.success) throw new AppError('INVALID_INPUT', REPLAY_ERRORS.format)
  return parsed.data
}

async function known(deps: FulfilDeps, id: string): Promise<boolean> {
  return (await callRpc(deps.db, 'admin_lookup', { p_query: id }, lookupRows)).length > 0
}

async function previewCheckout(deps: FulfilDeps, id: string): Promise<ReplayPreview> {
  const session = await deps.stripe.checkout.sessions.retrieve(id, { expand: SESSION_EXPAND })
  // Only a card or Alipay payment that has cleared; an async payment still pending is unpaid.
  if (session.payment_status !== 'paid') throw new AppError('CONFLICT', REPLAY_ERRORS.unpaid)
  const purchase = readPurchase(session, deps.products)
  return {
    kind: 'checkout',
    id,
    userId: purchase.userId,
    productId: purchase.product.id,
    credits: purchase.quote?.credits ?? null,
    amountTotal: session.amount_total,
    currency: session.currency,
    settled: await known(deps, id),
  }
}

async function previewSubscription(deps: FulfilDeps, id: string): Promise<ReplayPreview> {
  const sub = await deps.stripe.subscriptions.retrieve(id)
  // T9 writes who and what into the subscription's metadata at checkout.
  const owner = ownerSchema.safeParse(sub.metadata ?? {})
  if (!owner.success) throw new AppError('INVALID_INPUT', `subscription ${id}: metadata`)
  const state = subscriptionState(sub)
  return {
    kind: 'subscription',
    id,
    userId: owner.data.user_id,
    productId: owner.data.product_id,
    status: state.status,
    periodEnd: state.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    mirrored: await known(deps, id),
  }
}

export async function previewReplay(deps: FulfilDeps, rawId: unknown): Promise<ReplayPreview> {
  const id = parseId(rawId)
  return id.startsWith('cs_') ? previewCheckout(deps, id) : previewSubscription(deps, id)
}

// Re-checks everything the preview showed (Stripe may have moved on since), then writes.
export async function applyReplay(deps: FulfilDeps, rawId: unknown): Promise<{ preview: ReplayPreview; outcome: ReplayOutcome }> {
  const preview = await previewReplay(deps, rawId)
  const outcome = preview.kind === 'checkout' ? await fulfilCheckoutSession(deps, preview.id) : await syncSubscription(deps, preview.id)
  return { preview, outcome }
}
