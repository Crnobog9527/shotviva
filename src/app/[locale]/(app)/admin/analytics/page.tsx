import type { Metadata } from 'next'

import {
  AdminPage,
  ANALYTICS_COPY,
  AnalyticsView,
  cheapestCreditUsd,
  GROWTH_COPY,
  InsightsPanel,
  GrowthView,
  parseFunnelDim,
  parsePageSort,
  parseRange,
  parseView,
  posthogOn,
  PostHogOff,
  posthogProjectId,
  RangeTabs,
  Unconfigured,
  ViewTabs,
} from '@/core/admin'
import { requireAdmin } from '@/core/auth'
import { site } from '@/site/site.config'

// The proxy and layout 404 non-admins. Check again before starting any analytics reads.
export const instant = false

export const metadata: Metadata = { title: ANALYTICS_COPY.title }

// 「总览」 (ARCHITECTURE §16.2b) by default; 「漏斗」 and 「模板」 (§16.2c) with their own date filters;
// the T74 blocks (§16.2a) under 「明细」.
export default async function AdminAnalyticsPage({ searchParams }: PageProps<'/[locale]/admin/analytics'>) {
  await requireAdmin()
  const params = await searchParams
  const query = { view: parseView(params.view), range: parseRange(params.range), dim: parseFunnelDim(params.dim), sort: parsePageSort(params.sort) }
  const projectId = posthogProjectId()
  const insights = query.view === 'funnel' || query.view === 'templates'
  // Switched off (2026-11-21, PVUV.ai instead): a notice and a link, not panels that cannot fill.
  const off = !posthogOn()
  return (
    <AdminPage title={ANALYTICS_COPY.title} actions={insights ? undefined : <RangeTabs query={query} />}>
      <div className="grid min-w-0 gap-6">
        <ViewTabs query={query} />
        {off ? <PostHogOff /> : null}
        {query.view === 'overview' ? (
          <GrowthView range={query.range} />
        ) : off ? null : query.view === 'funnel' || query.view === 'templates' ? (
          <InsightsPanel view={query.view} params={params} creditUsd={cheapestCreditUsd(site.billing.products)} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{GROWTH_COPY.detailsNote}</p>
            {projectId ? (
              <AnalyticsView query={query} projectId={projectId} giftCredits={site.billing.freeCredits} />
            ) : (
              <Unconfigured range={query.range} />
            )}
          </>
        )}
      </div>
    </AdminPage>
  )
}
