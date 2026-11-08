import type { Metadata } from 'next'

import { AdminPage, DASHBOARD_DAYS, listPurchases, listSubscriptions, loadRevenueStats, ORDERS_COPY, OrdersView, ReplayPanel } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { serverEnv } from '@/core/env'

import { applyClawbackAction, applyReplayAction, previewClawbackAction, previewReplayAction } from './actions'

// /admin/orders (ARCHITECTURE §10, Plan A): list-price revenue from admin_revenue_stats, the
// purchase ledger and T9's subscription mirror. Stripe links use test paths outside production.
// The replay panel (T26) settles a paid session whose webhook never arrived.
export const instant = false

export const metadata: Metadata = { title: ORDERS_COPY.title }

const cursorParam = (value: string | string[] | undefined) => (typeof value === 'string' ? value : null)

export default async function AdminOrdersPage({ searchParams }: PageProps<'/[locale]/admin/orders'>) {
  await requireAdmin()
  const params = await searchParams
  const cursors = { purchases: cursorParam(params.p), subscriptions: cursorParam(params.s) }
  const db = createAdminSupabase()
  const [stats, purchases, subscriptions] = await Promise.all([
    loadRevenueStats(db, DASHBOARD_DAYS),
    listPurchases(db, cursors.purchases),
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
        clawback={{ preview: previewClawbackAction, apply: applyClawbackAction }}
      />
    </AdminPage>
  )
}
