import type { Metadata } from 'next'

import { AdminPage, DASHBOARD_DAYS, listPurchases, listSubscriptions, loadAttentionIds, loadRevenueStats, ORDERS_COPY, OrdersView, ReplayPanel } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { serverEnv } from '@/core/env'

import {
  acknowledgePaymentAction,
  applyClawbackAction,
  applyReplayAction,
  previewClawbackAction,
  previewReplayAction,
  unacknowledgePaymentAction,
} from './actions'

// /admin/orders (ARCHITECTURE §10, Plan A): list-price revenue from admin_revenue_stats, the
// purchase ledger and T9's subscription mirror. Stripe links use test paths outside production.
// The replay panel (T26) settles a paid session whose webhook never arrived. ?attention=1 (from the
// overview counter) lists only the refunds and disputes it counts (1882).
export const instant = false

export const metadata: Metadata = { title: ORDERS_COPY.title }

const cursorParam = (value: string | string[] | undefined) => (typeof value === 'string' ? value : null)

export default async function AdminOrdersPage({ searchParams }: PageProps<'/[locale]/admin/orders'>) {
  await requireAdmin()
  const params = await searchParams
  const cursors = { purchases: cursorParam(params.p), subscriptions: cursorParam(params.s) }
  const attention = params.attention === '1'
  const db = createAdminSupabase()
  const onlyIds = attention ? await loadAttentionIds(db) : undefined
  const [stats, purchases, subscriptions] = await Promise.all([
    loadRevenueStats(db, DASHBOARD_DAYS),
    listPurchases(db, cursors.purchases, onlyIds),
    listSubscriptions(db, cursors.subscriptions),
  ])
  return (
    <AdminPage title={ORDERS_COPY.title}>
      <ReplayPanel actions={{ preview: previewReplayAction, apply: applyReplayAction }} />
      <OrdersView
        stats={stats}
        purchases={purchases}
        subscriptions={subscriptions}
        cursors={cursors}
        stripeLive={serverEnv().VERCEL_ENV === 'production'}
        actions={{
          clawback: { preview: previewClawbackAction, apply: applyClawbackAction },
          acknowledge: { acknowledge: acknowledgePaymentAction, unacknowledge: unacknowledgePaymentAction },
        }}
        attention={attention}
      />
    </AdminPage>
  )
}
