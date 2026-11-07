import type { Metadata } from 'next'

import {
  AdminPage,
  ANALYTICS_COPY,
  AnalyticsView,
  listTemplateOptions,
  parseFunnelDim,
  parsePageSort,
  parseRange,
  posthogProjectId,
  RangeTabs,
  Unconfigured,
} from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { logger } from '@/core/logger'
import { site } from '@/site/site.config'

// /admin/analytics 「流量与转化」 (ARCHITECTURE §16.2a, T74): six blocks read from PostHog's Query
// API on the server with a read-only personal key (core/admin/analytics), cached ten minutes per
// range / funnel dimension. Admins only (the proxy and layout 404 everyone else; checked again
// here). Range, funnel dimension and page sort live in the URL.
export const instant = false

export const metadata: Metadata = { title: ANALYTICS_COPY.title }

// Template names for the templates block; a failed read only shows the ids.
async function templateNames(): Promise<Record<string, string>> {
  try {
    return Object.fromEntries((await listTemplateOptions(createAdminSupabase())).map((t) => [t.id, t.name]))
  } catch (error) {
    logger.warn('admin.analytics.template_names_failed', { error })
    return {}
  }
}

export default async function AdminAnalyticsPage({ searchParams }: PageProps<'/[locale]/admin/analytics'>) {
  await requireAdmin()
  const params = await searchParams
  const query = { range: parseRange(params.range), dim: parseFunnelDim(params.dim), sort: parsePageSort(params.sort) }
  const projectId = posthogProjectId()
  return (
    <AdminPage title={ANALYTICS_COPY.title} actions={projectId ? <RangeTabs query={query} /> : undefined}>
      {projectId ? (
        <AnalyticsView query={query} projectId={projectId} giftCredits={site.billing.freeCredits} templateNames={await templateNames()} />
      ) : (
        <Unconfigured />
      )}
    </AdminPage>
  )
}
