import type { Metadata } from 'next'

import { AdminPage, DASHBOARD_DAYS, loadDashboardStats, loadRevenueStats, OVERVIEW_COPY, OverviewView } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

// /admin overview (ARCHITECTURE §10): admin_dashboard_stats and admin_revenue_stats, one call
// each, in parallel, request-time.
export const instant = false

export const metadata: Metadata = { title: OVERVIEW_COPY.title }

export default async function AdminOverviewPage() {
  await requireAdmin()
  const db = createAdminSupabase()
  const [stats, revenue] = await Promise.all([loadDashboardStats(db), loadRevenueStats(db, DASHBOARD_DAYS)])
  return (
    <AdminPage title={OVERVIEW_COPY.title}>
      <OverviewView stats={stats} revenue={revenue} />
    </AdminPage>
  )
}
