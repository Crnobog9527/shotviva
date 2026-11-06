import type { Metadata } from 'next'

import { AdminPage, DASHBOARD_DAYS, JOBS_COPY, JobsView, listJobs, listStuckJobs, listTemplateOptions, loadDashboardStats, parseJobFilters } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { GENERATION_COST_USD } from '@/modules/image'

import { compensateJobAction, refundStuckAction, viewWorkAction } from './actions'

// /admin/jobs (ARCHITECTURE §10): every generation job, filtered and keyset-paged, plus the
// per-model / resolution counts and real cost from admin_dashboard_stats (T33; the constant
// only estimates pre-T33 jobs); stuck jobs
// (T25) on top, with view / compensate on each row.
export const instant = false

export const metadata: Metadata = { title: JOBS_COPY.title }

export default async function AdminJobsPage({ searchParams }: PageProps<'/admin/jobs'>) {
  await requireAdmin()
  const filters = parseJobFilters(await searchParams)
  const db = createAdminSupabase()
  const [page, templates, stats, stuck] = await Promise.all([
    listJobs(db, filters),
    listTemplateOptions(db),
    loadDashboardStats(db),
    listStuckJobs(db),
  ])
  return (
    <AdminPage title={JOBS_COPY.title}>
      <JobsView
        filters={filters}
        page={page}
        templates={templates}
        usage={{ days: DASHBOARD_DAYS, rows: stats.by_model }}
        unitCost={GENERATION_COST_USD}
        support={{ stuck, refundStuck: refundStuckAction, actions: { view: viewWorkAction, compensate: compensateJobAction } }}
      />
    </AdminPage>
  )
}
