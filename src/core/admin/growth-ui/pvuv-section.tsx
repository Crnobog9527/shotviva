import { PVUV_TOP_ROWS, type PvuvState } from '../analytics/pvuv-load'
import type { PvuvBreakdown, PvuvTotals } from '../analytics/pvuv-read'
import type { Range } from '../analytics/range'
import { delta, DASH, duration, n, pct, pointDelta, type Delta } from '../analytics-ui/format'
import { DeltaText, Empty, MetricLabel } from '../analytics-ui/parts'
import { PVUV_COPY } from '../analytics-ui/pvuv-copy'
import { GROWTH_COPY } from './copy'
import type { PvuvOverviewState } from './people-state'

const C = PVUV_COPY.overview
export type PvuvBreakdownState = PvuvState<PvuvBreakdown> | { status: 'loading' }
type Props = { range: Range; overview: PvuvOverviewState; sources: PvuvBreakdownState; pages: PvuvBreakdownState }

const num = (value: number | null) => (value === null ? DASH : n(value))
const seconds = (ms: number | null) => duration(ms === null ? null : ms / 1000)

function stateText(state: { status: string }): string | null {
  if (state.status === 'loading') return GROWTH_COPY.funnel.pvuvLoading
  if (state.status === 'unconfigured') return PVUV_COPY.unconfigured
  return state.status === 'failed' ? PVUV_COPY.failed : null
}

type Tile = { key: keyof typeof C.metrics; value: string; delta: Delta }

function tilesOf(current: PvuvTotals, previous: PvuvTotals | null): Tile[] {
  return [
    { key: 'visitors', value: n(current.uv), delta: delta(current.uv, previous?.uv ?? null) },
    { key: 'views', value: n(current.pv), delta: delta(current.pv, previous?.pv ?? null) },
    { key: 'bounce', value: pct(current.bounceRate), delta: pointDelta(current.bounceRate, previous?.bounceRate ?? null) },
    { key: 'duration', value: seconds(current.avgDurationMs), delta: delta(current.avgDurationMs, previous?.avgDurationMs ?? null) },
  ]
}

function Totals({ range, state }: { range: Range; state: PvuvOverviewState }) {
  if (state.status !== 'ok') return <p role="status" className="text-sm text-muted-foreground">{stateText(state)}</p>
  const { current, previous } = state.data
  return (
    <div className="grid gap-2">
      {previous ? <p className="text-sm text-muted-foreground">{C.compare(GROWTH_COPY.previous[range])}</p> : null}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
        {tilesOf(current, previous).map((tile) => (
          <div key={tile.key} className="grid gap-0.5">
            <dt>
              <MetricLabel id={`pvuv-${tile.key}`} metric={C.metrics[tile.key]} className="text-sm text-muted-foreground" />
            </dt>
            <dd className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-lg font-semibold tabular-nums">{tile.value}</span>
              <DeltaText delta={tile.delta} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// A short ranked list: name, visitors, and views when PVUV gives them.
function TopList({ title, column, state, label }: { title: string; column: string; state: PvuvBreakdownState; label: (value: string) => string }) {
  const note = stateText(state)
  const data = state.status === 'ok' ? state.data : null
  const showViews = Boolean(data?.rows.some((row) => row.events !== null))
  return (
    <div className="grid min-w-0 content-start gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {note ? <p role="status" className="text-sm text-muted-foreground">{note}</p> : null}
      {data && !data.ready ? <p className="text-xs text-muted-foreground">{PVUV_COPY.pending}</p> : null}
      {data ? (
        data.rows.length === 0 ? (
          <Empty />
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="py-1.5 text-left font-normal">{column}</th>
                <th scope="col" className="w-16 py-1.5 text-right font-normal">{C.visitors}</th>
                {showViews ? <th scope="col" className="w-16 py-1.5 text-right font-normal">{C.views}</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.rows.slice(0, PVUV_TOP_ROWS).map((row, i) => (
                <tr key={`${i}-${row.value}`} className="border-b border-border/60 last:border-0">
                  <td className="truncate py-1.5 pr-2" title={row.value}>{label(row.value)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{num(row.visitors)}</td>
                  {showViews ? <td className="py-1.5 text-right font-mono tabular-nums">{num(row.events)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}
    </div>
  )
}

const sourceLabel = (value: string) => (value === '' || value === 'direct' || value === '(direct)' || value === 'null' ? C.direct : value)

// 「访客与来源（PVUV.ai）」 on 「总览」 while PostHog is off: four totals, top sources, top pages.
export function PvuvSection({ range, overview, sources, pages }: Props) {
  return (
    <section className="grid min-w-0 gap-4 rounded-lg border border-border bg-card p-4 md:p-6">
      <header className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="grid min-w-0 flex-[1_1_18rem] gap-1">
          <h2 className="text-base font-semibold">{C.title}</h2>
          <p className="text-sm text-muted-foreground">{C.desc}</p>
        </div>
        <a href={PVUV_COPY.href} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">
          {PVUV_COPY.open} ↗
        </a>
      </header>
      <Totals range={range} state={overview} />
      <div className="grid gap-6 md:grid-cols-2">
        <TopList title={C.sourcesTitle} column={C.source} state={sources} label={sourceLabel} />
        <TopList title={C.pagesTitle} column={C.page} state={pages} label={(value) => value} />
      </div>
      <p className="text-xs text-muted-foreground">{PVUV_COPY.note}</p>
    </section>
  )
}
