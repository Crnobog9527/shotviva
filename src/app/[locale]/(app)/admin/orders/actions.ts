'use server'

import { refresh } from 'next/cache'

import {
  applyClawback,
  applyStripeReplay,
  previewClawback,
  previewStripeReplay,
  runAdminQuery,
  type ActionValue,
  type ClawbackPreview,
  type ClawbackResult,
} from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { stripeClient, type ReplayOutcome, type ReplayPreview } from '@/core/billing/stripe'
import { cancelOtherSubscriptions, type KeepSubscription } from '@/core/billing/subscription'
import { waffoClient } from '@/core/billing/waffo'
import { site } from '@/site/site.config'

// Stripe replay (T26) and 「扣回剩余积分」 (T71, also on refund tickets). Server actions are public
// endpoints, so each one re-checks the admin role; ids are validated again in core.

// A replayed upgrade cancels the old subscription, as the webhook would have (T66).
function deps() {
  const admin = createAdminSupabase()
  const stripe = stripeClient()
  const cancelOthers = (userId: string, keep: KeepSubscription) =>
    cancelOtherSubscriptions({ admin, stripe: () => stripe, waffo: () => waffoClient() }, userId, keep)
  return { stripe, db: admin, admin, products: site.billing.products, cancelOthers }
}

export async function previewReplayAction(input: { id?: unknown }): Promise<ActionValue<ReplayPreview>> {
  await requireAdmin()
  return runAdminQuery(() => previewStripeReplay(deps(), input.id))
}

export async function applyReplayAction(input: { id?: unknown }): Promise<ActionValue<{ outcome: ReplayOutcome }>> {
  await requireAdmin()
  return runAdminQuery(async () => {
    const { outcome } = await applyStripeReplay(deps(), input.id)
    refresh()
    return { outcome }
  })
}

export async function previewClawbackAction(input: { paymentId?: unknown }): Promise<ActionValue<ClawbackPreview>> {
  await requireAdmin()
  return runAdminQuery(() => previewClawback(createAdminSupabase(), input.paymentId))
}

export async function applyClawbackAction(input: { paymentId?: unknown }): Promise<ActionValue<ClawbackResult>> {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const result = await applyClawback(createAdminSupabase(), input.paymentId, admin.id)
    refresh()
    return result
  })
}
