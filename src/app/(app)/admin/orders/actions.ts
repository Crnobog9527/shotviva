'use server'

import { refresh } from 'next/cache'

import { applyStripeReplay, previewStripeReplay, runAdminQuery, type ActionValue } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { stripeClient, type ReplayOutcome, type ReplayPreview } from '@/core/billing/stripe'
import { site } from '@/site/site.config'

// Stripe replay (T26). Server actions are public endpoints, so each one re-checks the admin
// role; the id is validated again in core/billing/stripe/replay.ts.

function deps() {
  const admin = createAdminSupabase()
  return { stripe: stripeClient(), db: admin, admin, products: site.billing.products }
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
