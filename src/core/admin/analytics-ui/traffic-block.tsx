import { AnalyticsLink } from './analytics-link'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table'
import { sqlEditorLink } from '../analytics/links'
import type { Block } from '../analytics/load'
import type { Window } from '../analytics/range'
import { trafficSessionsQuery, trafficViewsQuery, type Channel, type Traffic } from '../analytics/traffic'
import { rate } from '../analytics/values'
import { formatBeijing } from '../shell/format'
import { ANALYTICS_COPY } from './copy'
import { n, pct } from './format'
import { analyticsHref, type AnalyticsQuery } from './href'
import { BlockFrame, MetricLabel, Unavailable } from './parts'

const COPY = ANALYTICS_COPY.traffic
const channels: Channel[] = ['google', 'direct', 'chatgpt', 'bing', 'other', 'internal']

function Channels({ data }: { data: Traffic }) {
  return (
    <section className="grid min-w-0 content-start gap-2">
      <h3 className="font-semibold">{COPY.channelsTitle}</h3>
      <p className="text-sm text-muted-foreground">{COPY.channelsDesc}</p>
      <Table aria-label={COPY.channelsTitle}>
        <TableHeader>
          <TableRow>
            <TableHead>{COPY.channel}</TableHead>
            <TableHead className="text-right">{COPY.sessions}</TableHead>
            <TableHead className="text-right">{COPY.sessionShare}</TableHead>
            <TableHead className="text-right">{COPY.entryEn}</TableHead>
            <TableHead className="text-right">{COPY.entryZh}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {channels.map((key) => (
            <TableRow key={key}>
              <TableCell className="whitespace-normal">{COPY.channels[key]}</TableCell>
              <TableCell className="text-right tabular-nums">{n(data.channels[key])}</TableCell>
              <TableCell className="text-right tabular-nums">{pct(rate(data.channels[key], data.sessions))}</TableCell>
              <TableCell className="text-right tabular-nums">{n(data.homeEntries[key].en)}</TableCell>
              <TableCell className="text-right tabular-nums">{n(data.homeEntries[key].zh)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}

function Automation({ data }: { data: Traffic }) {
  return (
    <section className="grid min-w-0 content-start gap-2">
      <h3 className="font-semibold">{COPY.botsTitle}</h3>
      <p className="text-sm text-muted-foreground">{COPY.botsDesc}</p>
      <dl className="divide-y divide-border">
        {(['identified', 'suspected', 'unknown'] as const).map((key) => (
          <div key={key} className="flex flex-wrap items-baseline justify-between gap-x-2 py-2 text-sm">
            <dt><MetricLabel id={`traffic-${key}`} metric={COPY.metrics[key]} /></dt>
            <dd className="tabular-nums">{COPY.countAndShare(n(data[key]), pct(rate(data[key], data.views)))}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">{COPY.botsCoverage}</p>
    </section>
  )
}

export function TrafficView({ data, window, query }: { data: Traffic; window: Window; query: AnalyticsQuery }) {
  return (
    <div className="grid min-w-0 gap-5">
      <p className="text-xs text-muted-foreground">{COPY.window(formatBeijing(window.start), formatBeijing(window.end))}</p>
      <dl className="grid grid-cols-3 gap-2">
        {(['views', 'visitors', 'sessions'] as const).map((key) => (
          <div key={key} className="grid content-between gap-1 rounded-md bg-muted px-2 py-3 sm:px-4">
            <dt className="text-sm"><MetricLabel id={`traffic-${key}`} metric={COPY.metrics[key]} /></dt>
            <dd className="text-xl font-semibold tabular-nums">{n(data[key])}</dd>
          </div>
        ))}
      </dl>
      {data.views === 0 && <p role="status" className="text-sm text-muted-foreground">{COPY.noViews}</p>}
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Channels data={data} />
        <Automation data={data} />
      </div>
      <details className="text-sm text-muted-foreground">
        <summary className="w-fit cursor-pointer rounded-sm text-foreground">{COPY.excludedTitle}</summary>
        <dl className="mt-2 grid max-w-md gap-1">
          {(['admin', 'test', 'nonPublicHost', 'missing'] as const).map((key) => (
            <div key={key} className="flex justify-between gap-3">
              <dt>{COPY.excluded[key]}</dt><dd className="tabular-nums">{n(data.excluded[key])}</dd>
            </div>
          ))}
        </dl>
      </details>
      <AnalyticsLink href={analyticsHref(query, { dim: 'source' }, '#conversion-funnel')} className="w-fit text-sm text-primary underline-offset-4 hover:underline">
        {COPY.funnelLink}
      </AnalyticsLink>
    </div>
  )
}

type Props = { projectId: string; query: AnalyticsQuery; result: Promise<Block<Traffic>> }

export async function TrafficBlock({ projectId, query, result }: Props) {
  const block = await result
  const links = block.status === 'ok' ? [
    { href: sqlEditorLink(projectId, trafficViewsQuery(block.window)), label: COPY.browserQuery },
    { href: sqlEditorLink(projectId, trafficSessionsQuery(block.window)), label: COPY.sessionQuery },
  ] : []
  return (
    <div id="traffic" className="scroll-mt-4">
      <BlockFrame title={COPY.title} desc={COPY.desc} links={links}>
        {block.status === 'ok' ? <TrafficView data={block.data} window={block.window} query={query} /> : <Unavailable />}
      </BlockFrame>
    </div>
  )
}
