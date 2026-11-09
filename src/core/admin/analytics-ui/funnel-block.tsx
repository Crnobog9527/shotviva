import { funnelResponse } from '../analytics/funnel-response'
import { funnelEnd } from '../analytics/load'
import { FunnelExplorer } from './funnel-explorer'
import type { AnalyticsQuery } from './href'

export async function FunnelBlock({ query, projectId }: { query: AnalyticsQuery; projectId: string }) {
  const end = funnelEnd()
  const initial = await funnelResponse(projectId, query.range, query.dim === 'visitor' ? 'visitor' : 'breakdowns', end)
  return (
    <div id={query.dim === 'source' ? undefined : 'funnel'} className="scroll-mt-4">
      <FunnelExplorer key={`${query.range}-${end}-${query.dim}`} query={query} initial={initial} initialEnd={end} />
    </div>
  )
}
