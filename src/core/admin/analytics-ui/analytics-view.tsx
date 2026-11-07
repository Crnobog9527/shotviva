import { Suspense } from 'react'

import { RANGES } from '../analytics/range'
import { ActivationBlock } from './activation-block'
import { ANALYTICS_COPY as COPY } from './copy'
import { FunnelBlock } from './funnel-block'
import { analyticsHref, type AnalyticsQuery } from './href'
import { PagesBlock } from './pages-block'
import { BlockSkeleton, LinkTabs } from './parts'
import { PaymentBlock } from './payment-block'
import { ProblemsBlock } from './problems-block'
import { TemplatesBlock } from './templates-block'

export function RangeTabs({ query }: { query: AnalyticsQuery }) {
  const tabs = RANGES.map((range) => ({ key: range, label: COPY.ranges[range], href: analyticsHref(query, { range }) }))
  return <LinkTabs label={COPY.rangeLabel} tabs={tabs} current={query.range} />
}

export function Unconfigured() {
  return (
    <div role="status" className="grid gap-3 rounded-lg border border-dashed border-border p-6">
      <h2 className="font-semibold">{COPY.unconfigured.title}</h2>
      <p className="text-sm text-muted-foreground">{COPY.unconfigured.body}</p>
      <ul className="grid gap-1 font-mono text-sm">
        {COPY.unconfigured.vars.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}

type Props = { query: AnalyticsQuery; projectId: string; giftCredits: number; templateNames: Record<string, string> }

// The six blocks of ARCHITECTURE §16.2a, each streamed on its own: a slow or failing PostHog
// query only holds or blanks its own block.
export function AnalyticsView({ query, projectId, giftCredits, templateNames }: Props) {
  const blocks = [
    { key: 'pages', title: COPY.pages.title, node: <PagesBlock query={query} projectId={projectId} /> },
    { key: 'funnel', title: COPY.funnel.title, node: <FunnelBlock query={query} projectId={projectId} /> },
    { key: 'payment', title: COPY.payment.title, node: <PaymentBlock query={query} projectId={projectId} /> },
    { key: 'activation', title: COPY.activation.title, node: <ActivationBlock range={query.range} giftCredits={giftCredits} projectId={projectId} /> },
    { key: 'templates', title: COPY.templates.title, node: <TemplatesBlock range={query.range} names={templateNames} projectId={projectId} /> },
    { key: 'problems', title: COPY.problems.title, node: <ProblemsBlock range={query.range} projectId={projectId} /> },
  ]
  return (
    <div className="grid min-w-0 gap-6">
      <p className="text-sm text-muted-foreground">
        {COPY.intro}（{COPY.compare[query.range]}）。
      </p>
      {blocks.map((block) => (
        // Keyed on the query so switching range shows the skeleton instead of stale numbers.
        <Suspense key={`${block.key}-${query.range}-${block.key === 'funnel' ? query.dim : ''}`} fallback={<BlockSkeleton title={block.title} />}>
          {block.node}
        </Suspense>
      ))}
    </div>
  )
}
