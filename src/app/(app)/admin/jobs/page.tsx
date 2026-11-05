import type { Metadata } from 'next'

import { AdminPage, DASHBOARD_DAYS, JOBS_COPY, JobsView, listJobs, listTemplateOptions, loadDashboardStats, parseJobFilters } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { GENERATION_COST_USD } from '@/modules/image'

// /admin/jobs (ARCHITECTURE §10): every generation job, filtered and keyset-paged, plus the
// per-model / resolution counts from admin_dashboard_stats with an estimated cost.
export const instant = false

export const metadata: Metadata = { title: JOBS_COPY.title }

export default async function AdminJobsPage({ searchParams }: PageProps<'/admin/jobs'>) {
  await requireAdmin()
  const filters = parseJobFilters(await searchParams)
  const db = createAdminSupabase()
  const [page, templates, stats] = await Promise.all([listJobs(db, filters), listTemplateOptions(db), loadDashboardStats(db)])
  return (
    <AdminPage title={JOBS_COPY.title}>
      <JobsView
        filters={filters}
        page={page}
        templates={templates}
        usage={{ days: DASHBOARD_DAYS, rows: stats.by_model }}
        unitCost={GENERATION_COST_USD}
      />
    </AdminPage>
  )
}
