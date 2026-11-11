import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { MetricLabel } from '../analytics-ui/parts'
import { DASH, n } from '../analytics-ui/format'
import { attribute, isEmptyLine, type SourceGroupRow, type SourceLine } from '../growth/attribution'
import type { SourcesBlock } from '../growth/load'
import type { GrowthPeriod } from '../growth/stats'
import { usd } from '../orders/money'
import { cn } from '../../ui/cn'
import { GROWTH_COPY as COPY } from './copy'
import { Section } from './section'

const C = COPY.sources
export type SourcesState = SourcesBlock | { status: 'loading' }
const COLUMNS = ['visitors', 'signups', 'payers', 'net'] as const

// Phones: label on its own line, the four numbers under it as one wrapping line; wider: one row of
// five columns.
const ROW = 'flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_6rem_6.5rem] sm:gap-x-2'
// Sources with nothing this period wait behind 「显示全部」 (a checkbox inside the section).
const ZERO = 'hidden sm:hidden group-has-[:checked]/sources:flex sm:group-has-[:checked]/sources:grid'

// Groups with a total; search, AI, social and ads open to one row per source. Same definitions as
// before the split: visitors by first page view, people by first touch, promoters from the database.
export function SourcesSection({ db, state }: { db: GrowthPeriod; state: SourcesState }) {
  const rows = attribute(db, state.status === 'ok' ? state.data : null)
  const note = state.status === 'loading' ? C.loading : state.status !== 'ok' ? C.noPostHog : state.data.truncated ? C.truncated : null
  const hidden = rows.reduce((total, row) => total + (isEmptyLine(row) ? 1 : row.children.filter(isEmptyLine).length), 0)
  return (
    <Section title={C.title} desc={C.desc}>
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      <div className="group/sources grid text-sm" role="group" aria-label={C.title}>
        <div className={cn(ROW, 'hidden border-b border-border text-muted-foreground sm:grid')} aria-hidden>
          <span>{C.source}</span>
          {COLUMNS.map((key) => (
            <span key={key} className="text-right">
              <MetricLabel id={`growth-source-col-${key}`} metric={C.columns[key]} className="justify-end" />
            </span>
          ))}
        </div>
        {rows.map((row) => (row.children.length ? <GroupRows key={row.key} row={row} /> : <Line key={row.key} line={row} label={<GroupLabel row={row} />} />))}
        {hidden ? (
          <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="size-4 accent-primary" />
            {C.showAll(n(hidden))}
          </label>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{C.limits}</p>
    </Section>
  )
}

function GroupLabel({ row }: { row: SourceGroupRow }) {
  return <MetricLabel id={`growth-source-${row.key}`} metric={C.groups[row.key]} className="font-medium" />
}

// A group that splits into sources: the summary is the total, open when anything came from it.
function GroupRows({ row }: { row: SourceGroupRow }) {
  const empty = isEmptyLine(row)
  return (
    <details open={!empty} className={cn('group/item border-b border-border', empty && 'hidden group-has-[:checked]/sources:block')}>
      <summary className={cn(ROW, 'cursor-pointer list-none rounded-sm focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden')}>
        <span className="flex w-full items-center gap-1 sm:w-auto">
          <ChevronRight aria-hidden className="size-4 flex-none text-muted-foreground transition-transform group-open/item:rotate-90 motion-reduce:transition-none" />
          <GroupLabel row={row} />
        </span>
        <Numbers line={row} strong />
      </summary>
      <div className="pb-2">
        {row.children.map((child) => (
          <Line key={child.key} line={child} label={<span className="sm:pl-6">{C.sourceLabels[child.key] ?? child.key}</span>} nested />
        ))}
      </div>
    </details>
  )
}

function Line({ line, label, nested = false }: { line: SourceLine; label: ReactNode; nested?: boolean }) {
  const empty = isEmptyLine(line)
  return (
    <div className={cn(ROW, nested ? 'pl-6 sm:pl-0' : 'border-b border-border', empty && cn(ZERO, 'text-muted-foreground'))}>
      <span className="w-full sm:w-auto">
        {label}
      </span>
      <Numbers line={line} />
    </div>
  )
}

// The four numbers; on phones each carries its column name in front.
function Numbers({ line, strong = false }: { line: SourceLine; strong?: boolean }) {
  const values = [line.visitors === null ? DASH : n(line.visitors), n(line.signups), n(line.payers), usd.format(line.net)]
  return COLUMNS.map((key, i) => (
    <span key={key} className={cn('whitespace-nowrap tabular-nums sm:text-right', strong && 'font-medium')}>
      <span className="text-xs text-muted-foreground sm:sr-only">{C.columns[key].label} </span>
      {values[i]}
    </span>
  ))
}
