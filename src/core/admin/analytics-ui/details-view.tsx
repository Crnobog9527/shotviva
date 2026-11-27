import { Suspense } from 'react'

import { GROWTH_COPY } from '../growth-ui'
import { AnalyticsView, Unconfigured } from './analytics-view'
import { CollectionsBlock } from './collections-block'
import { COLLECTIONS_COPY } from './collections-copy'
import type { AnalyticsQuery } from './href'
import { BlockSkeleton } from './parts'

type Props = { query: AnalyticsQuery; projectId: string | null; posthog: boolean; giftCredits: number }

// 「明细」: the PostHog blocks while PostHog is on (or how to configure it), and the template
// collection block always: its numbers come from the database and PVUV.ai (ARCHITECTURE §5.1g).
export function DetailsView({ query, projectId, posthog, giftCredits }: Props) {
  return (
    <>
      {posthog ? <p className="text-sm text-muted-foreground">{GROWTH_COPY.detailsNote}</p> : null}
      {posthog ? (projectId ? <AnalyticsView query={query} projectId={projectId} giftCredits={giftCredits} /> : <Unconfigured range={query.range} />) : null}
      <Suspense key={query.range} fallback={<BlockSkeleton title={COLLECTIONS_COPY.title} />}>
        <CollectionsBlock range={query.range} />
      </Suspense>
    </>
  )
}
