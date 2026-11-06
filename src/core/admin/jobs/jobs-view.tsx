import Link from 'next/link'

import type { Page } from '../cursor'
import type { ModelUsage } from '../overview/stats'
import type { StuckJob } from '../support/stuck-jobs'
import { StuckJobsPanel, type JobSupportActions, type RefundStuck } from '../support-ui'
import { JOBS_COPY as COPY } from './copy'
import { filtersHref, type JobFilters } from './filters'
import { JobsFilters } from './jobs-filters'
import { JobsTable } from './jobs-table'
import { ModelStats } from './model-stats'
import type { AdminJob } from './repository'

type Props = {
  filters: JobFilters
  page: Page<AdminJob>
  templates: { id: string; name: string }[]
  usage: { days: number; rows: ModelUsage[] }
  unitCost: Readonly<Record<string, number>>
  support: { stuck: StuckJob[]; refundStuck: RefundStuck; actions: JobSupportActions }
}

export function JobsView({ filters, page, templates, usage, unitCost, support }: Props) {
  return (
    <div className="grid gap-6">
      <StuckJobsPanel jobs={support.stuck} refund={support.refundStuck} />
      <JobsFilters filters={filters} templates={templates} />
      <JobsTable jobs={page.items} actions={support.actions} />
      <div className="flex gap-4 text-sm">
        {filters.cursor ? (
          <Link href={filtersHref(filters, null)} className="text-primary hover:underline">
            {COPY.first}
          </Link>
        ) : null}
        {page.nextCursor ? (
          <Link href={filtersHref(filters, page.nextCursor)} className="text-primary hover:underline">
            {COPY.next}
          </Link>
        ) : null}
      </div>
      <ModelStats usage={usage.rows} days={usage.days} unitCost={unitCost} />
    </div>
  )
}
