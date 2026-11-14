import { readShares } from '../analytics/load'
import { sqlEditorLink } from '../analytics/links'
import type { Range } from '../analytics/range'
import { SHARE_STEPS, shareFunnelQuery, type ShareFunnel, type ShareStep } from '../analytics/shares'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table'
import { ANALYTICS_COPY } from './copy'
import { n } from './format'
import { BlockFrame, MetricLabel, Unavailable } from './parts'

const COPY = ANALYTICS_COPY.shares
const NUM = 'text-right font-mono tabular-nums'

// Shares and opens also show how many presses and page loads they were.
const eventsOf = (funnel: ShareFunnel, step: ShareStep) => (step === 'shares' ? funnel.sharePresses : step === 'opens' ? funnel.openLoads : null)

export function SharesTable({ funnel }: { funnel: ShareFunnel }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{COPY.step}</TableHead>
          <TableHead className="text-right">{COPY.people}</TableHead>
          <TableHead className="text-right">{COPY.events}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {SHARE_STEPS.map((step) => (
          <TableRow key={step}>
            <TableCell className={step === 'signedOutOpens' ? 'pl-6' : undefined}>
              <MetricLabel id={`share-${step}`} metric={COPY.metrics[step]} />
            </TableCell>
            <TableCell className={NUM}>{n(funnel[step])}</TableCell>
            <TableCell className={NUM}>{eventsOf(funnel, step) === null ? '—' : n(eventsOf(funnel, step) as number)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export async function SharesBlock({ range, projectId }: { range: Range; projectId: string }) {
  const block = await readShares(range)
  const links = block.status === 'ok' ? [{ href: sqlEditorLink(projectId, shareFunnelQuery(block.window)), label: ANALYTICS_COPY.openInPostHog }] : []
  return (
    <BlockFrame title={COPY.title} desc={COPY.desc} links={links}>
      {block.status === 'ok' ? <SharesTable funnel={block.data} /> : <Unavailable />}
    </BlockFrame>
  )
}
