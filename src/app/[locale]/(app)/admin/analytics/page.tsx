import type { Metadata } from 'next'

import {
  AdminPage,
  ANALYTICS_COPY,
  AnalyticsView,
  parseFunnelDim,
  parsePageSort,
  parseRange,
  posthogProjectId,
  RangeTabs,
  Unconfigured,
} from '@/core/admin'
import { requireAdmin } from '@/core/auth'
import { site } from '@/site/site.config'

// The proxy and layout 404 non-admins. Check again before starting any analytics reads.
export const instant = false

export const metadata: Metadata = { title: ANALYTICS_COPY.title }

export default async function AdminAnalyticsPage({ searchParams }: PageProps<'/[locale]/admin/analytics'>) {
  await requireAdmin()
  const params = await searchParams
  const query = { range: parseRange(params.range), dim: parseFunnelDim(params.dim), sort: parsePageSort(params.sort) }
  const projectId = posthogProjectId()
  return (
    <AdminPage title={ANALYTICS_COPY.title} actions={<RangeTabs query={query} />}>
      {projectId ? (
        <AnalyticsView query={query} projectId={projectId} giftCredits={site.billing.freeCredits} />
      ) : (
        <Unconfigured range={query.range} />
      )}
    </AdminPage>
  )
}
