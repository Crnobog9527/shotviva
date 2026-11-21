import { notifyOwnerNow } from '@/core/alerts'
import { createAdminSupabase } from '@/core/auth/supabase-admin'
import { runPaymentFeeReconcile, type ReconcileStripe } from '@/core/billing/fees/reconcile'
import { waffoSettlementApi } from '@/core/billing/fees/waffo-settlement'
import { stripeClient } from '@/core/billing/stripe/client'
import { waffoConfig } from '@/core/billing/waffo/config'
import { authorizedCron } from '@/core/cron/authorized'
import { serverEnv } from '@/core/env'
import { logger } from '@/core/logger'

// Vercel cron, hourly (F4, ARCHITECTURE §6.2 订单手续费 · 对账): turns estimated payment fees into
// the providers' final figures and tells the Owner what stays unreconciled. Bearer CRON_SECRET
// only. Idempotent and bounded (40 payments, a 90-second budget per run); with
// payment_fee_settings.record_from unset it reads one row and stops.
export const maxDuration = 300

function stripeOrNull(): ReconcileStripe | null {
  return serverEnv().STRIPE_SECRET_KEY ? stripeClient() : null
}

function waffoOrNull() {
  try {
    waffoConfig()
    return waffoSettlementApi()
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  if (!authorizedCron(request)) return new Response(null, { status: 401 })
  try {
    const summary = await runPaymentFeeReconcile({
      db: createAdminSupabase(), stripe: stripeOrNull(), waffo: waffoOrNull(), alert: notifyOwnerNow, now: () => new Date(),
    })
    logger.info('payment_fees.reconcile', summary)
    return Response.json(summary)
  } catch (error) {
    logger.error('payment fee reconciliation failed', { error })
    return new Response(null, { status: 500 })
  }
}
