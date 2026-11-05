import type { Metadata } from 'next'

import { AdminPage, loadDashboardStats, OVERVIEW_COPY, OverviewView } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

// /admin overview (ARCHITECTURE §10): one admin_dashboard_stats call per view, request-time.
export const instant = false

export const metadata: Metadata = { title: OVERVIEW_COPY.title }

export default async function AdminOverviewPage() {
  await requireAdmin()
  const stats = await loadDashboardStats(createAdminSupabase())
  return (
    <AdminPage title={OVERVIEW_COPY.title}>
      <OverviewView stats={stats} />
    </AdminPage>
  )
}
