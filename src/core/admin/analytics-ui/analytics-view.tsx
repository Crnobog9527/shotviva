import { Suspense, type ReactNode } from 'react'

import { groupOf } from '../analytics/funnel-options'
import { funnelResponse } from '../analytics/funnel-response'
import { funnelEnd, readTraffic } from '../analytics/load'
import { RANGES, type Range } from '../analytics/range'
import { ActivationBlock } from './activation-block'
import { ANALYTICS_COPY as COPY } from './copy'
import { EdgeTraffic } from './edge-traffic'
import { FunnelBlock } from './funnel-block'
import { GROWTH_COPY } from '../growth-ui/copy'
import { analyticsHref, VIEWS, type AnalyticsQuery } from './href'
import { PagesBlock } from './pages-block'
import { BlockSkeleton, LinkTabs } from './parts'
import { PaymentBlock } from './payment-block'
import { ProblemsBlock } from './problems-block'
import { TrafficBlock } from './traffic-block'
import { TemplatesBlock } from './templates-block'

export function ViewTabs({ query }: { query: AnalyticsQuery }) {
  const tabs = VIEWS.map((view) => ({ key: view, label: GROWTH_COPY.views[view], href: analyticsHref(query, { view }) }))
  return <LinkTabs label={GROWTH_COPY.viewLabel} tabs={tabs} current={query.view} />
}

export function RangeTabs({ query }: { query: AnalyticsQuery }) {
  const tabs = RANGES.map((range) => ({ key: range, label: COPY.ranges[range], href: analyticsHref(query, { range }) }))
  return <LinkTabs label={COPY.rangeLabel} tabs={tabs} current={query.range} preserveDim />
}

export function Unconfigured({ range }: { range: Range }) {
  return (
    <div className="grid min-w-0 gap-6">
      <div role="status" className="grid gap-3 rounded-lg border border-dashed border-border p-6">
        <h2 className="font-semibold">{COPY.unconfigured.title}</h2>
        <p className="text-sm text-muted-foreground">{COPY.unconfigured.body}</p>
        <ul className="grid gap-1 font-mono text-sm">
          {COPY.unconfigured.vars.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <Suspense key={range} fallback={<BlockSkeleton title={COPY.edge.title} />}>
        <EdgeTraffic range={range} />
      </Suspense>
    </div>
  )
}

type Props = { query: AnalyticsQuery; projectId: string; giftCredits: number }

async function AfterFirstReads({ ready, children }: { ready: Promise<unknown>; children: ReactNode }) {
  await ready
  return children
}

// PostHog runs three queries per project at once. Reserve the first batch for both traffic
// queries and the selected funnel. Vercel has its own quota and can stream independently.
export function AnalyticsView({ query, projectId, giftCredits }: Props) {
  const end = funnelEnd()
  const traffic = readTraffic(query.range, end)
  const funnel = funnelResponse(projectId, query.range, groupOf(query.dim), end)
  const firstReads = Promise.allSettled([traffic, funnel])
  const blocks = [
    { key: 'traffic', title: COPY.traffic.title, priority: true, node: <TrafficBlock query={query} projectId={projectId} result={traffic} /> },
    { key: 'edge', title: COPY.edge.title, priority: true, node: <EdgeTraffic range={query.range} /> },
    { key: 'pages', title: COPY.pages.title, node: <PagesBlock query={query} projectId={projectId} end={end} /> },
    { key: 'funnel', title: COPY.funnel.title, priority: true, node: <FunnelBlock query={query} end={end} result={funnel} /> },
    { key: 'payment', title: COPY.payment.title, node: <PaymentBlock query={query} projectId={projectId} /> },
    { key: 'activation', title: COPY.activation.title, node: <ActivationBlock range={query.range} giftCredits={giftCredits} projectId={projectId} /> },
    { key: 'templates', title: COPY.templates.title, node: <TemplatesBlock range={query.range} projectId={projectId} /> },
    { key: 'problems', title: COPY.problems.title, node: <ProblemsBlock range={query.range} projectId={projectId} /> },
  ]
  return (
    <div className="grid min-w-0 gap-6">
      <p className="text-sm text-muted-foreground">
        {COPY.intro}（{COPY.compare[query.range]}）。
      </p>
      {blocks.map((block) => (
        // Keyed on the query so switching range shows the skeleton instead of stale numbers.
        <div key={block.key} className="grid min-w-0 scroll-mt-4 gap-4" id={block.key === 'traffic' && query.dim === 'source' ? 'funnel' : undefined}>
          {block.key === 'payment' ? (
            <header className="grid gap-1">
              <h2 className="font-semibold">{COPY.traffic.projectTitle}</h2>
              <p className="text-sm text-muted-foreground">{COPY.traffic.projectDesc}</p>
            </header>
          ) : null}
          <Suspense key={`${query.range}-${block.key === 'funnel' ? query.dim : ''}`} fallback={<BlockSkeleton title={block.title} />}>
            {block.priority ? block.node : <AfterFirstReads ready={firstReads}>{block.node}</AfterFirstReads>}
          </Suspense>
        </div>
      ))}
    </div>
  )
}
