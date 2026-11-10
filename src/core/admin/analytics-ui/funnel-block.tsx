import type { FunnelResponse } from '../analytics/funnel-response'
import { FunnelExplorer } from './funnel-explorer'
import type { AnalyticsQuery } from './href'

type Props = { query: AnalyticsQuery; end: number; result: Promise<FunnelResponse | null> }

export async function FunnelBlock({ query, end, result }: Props) {
  const initial = await result
  return (
    <div id={query.dim === 'source' ? undefined : 'funnel'} className="scroll-mt-4">
      <FunnelExplorer key={`${query.range}-${end}-${query.dim}`} query={query} initial={initial} initialEnd={end} />
    </div>
  )
}
