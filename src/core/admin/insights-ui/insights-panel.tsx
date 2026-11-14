import { Suspense } from 'react'

import { BlockSkeleton } from '../analytics-ui/parts'
import { readEnd } from '../insights/load'
import { INSIGHTS_COPY as COPY } from './copy'
import { FunnelView } from './funnel-view'
import { parseInsights, type InsightsView } from './query'
import { TemplatesView } from './templates-view'

type Props = { view: InsightsView; params: Record<string, string | string[] | undefined>; creditUsd: number | null }

// Keyed on the whole query, so changing a filter shows the skeleton instead of stale numbers.
export function InsightsPanel({ view, params, creditUsd }: Props) {
  const query = parseInsights(view, params, readEnd())
  const key = JSON.stringify(query)
  return view === 'funnel' ? (
    <Suspense key={key} fallback={<BlockSkeleton title={COPY.funnel.title} />}>
      <FunnelView query={query} />
    </Suspense>
  ) : (
    <Suspense key={key} fallback={<BlockSkeleton title={COPY.templates.title} />}>
      <TemplatesView query={query} creditUsd={creditUsd} />
    </Suspense>
  )
}
