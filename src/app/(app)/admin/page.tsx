import type { Metadata } from 'next'

import { AdminPage, DASHBOARD_DAYS, loadDashboardStats, loadRevenueStats, loadTodoCounts, OVERVIEW_COPY, OverviewView } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { isWishlistEnabled } from '@/core/wishlist'
import { GENERATION_COST_USD } from '@/modules/image'
import { site } from '@/site/site.config'

// /admin overview (ARCHITECTURE §10): the to-do strip (admin_todo_counts, T26) on top, then
// admin_dashboard_stats and admin_revenue_stats; one call each, in parallel, request-time.
export const instant = false

export const metadata: Metadata = { title: OVERVIEW_COPY.title }

export default async function AdminOverviewPage() {
  await requireAdmin()
  const db = createAdminSupabase()
  const [stats, revenue, counts] = await Promise.all([loadDashboardStats(db), loadRevenueStats(db, DASHBOARD_DAYS), loadTodoCounts(db)])
  return (
    <AdminPage title={OVERVIEW_COPY.title}>
      <OverviewView stats={stats} revenue={revenue} todo={{ counts, wishlist: isWishlistEnabled(site) }} unitCost={GENERATION_COST_USD} />
    </AdminPage>
  )
}
