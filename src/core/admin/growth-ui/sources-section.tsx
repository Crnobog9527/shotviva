import { MetricLabel } from '../analytics-ui/parts'
import { DASH, n } from '../analytics-ui/format'
import { attribute, type SourceRow } from '../growth/attribution'
import type { SourcesBlock } from '../growth/load'
import type { GrowthPeriod } from '../growth/stats'
import { usd } from '../orders/money'
import { GROWTH_COPY as COPY } from './copy'
import { Section } from './section'

const C = COPY.sources
export type SourcesState = SourcesBlock | { status: 'loading' }
const COLUMNS = ['visitors', 'signups', 'payers', 'net'] as const

// One row per source: visitors, then the sign-ups, buyers and money they brought. Rows that are
// all zero stay, so the Owner sees which channels bring nothing yet.
export function SourcesSection({ db, state }: { db: GrowthPeriod; state: SourcesState }) {
  const rows = attribute(db, state.status === 'ok' ? state.data : null)
  const note = state.status === 'loading' ? C.loading : state.status !== 'ok' ? C.noPostHog : state.data.truncated ? C.truncated : null
  return (
    <Section title={C.title} desc={C.desc}>
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      <ul className="grid divide-y divide-border sm:hidden" aria-label={C.title}>
        {rows.map((row) => (
          <SourceListItem key={row.key} row={row} />
        ))}
      </ul>
      <div className="hidden sm:block">
        <table className="w-full text-sm" aria-label={C.title}>
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className="py-2 text-left font-normal">{C.source}</th>
              {COLUMNS.map((key) => (
                <th key={key} scope="col" className="py-2 text-right font-normal">
                  <MetricLabel id={`growth-source-col-${key}`} metric={C.columns[key]} className="justify-end" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <SourceTableRow key={row.key} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

const isQuiet = (row: SourceRow) => row.visitors === 0 && row.signups === 0 && row.payers === 0

// Phones: one line per source, the four numbers in words underneath.
function SourceListItem({ row }: { row: SourceRow }) {
  const cols = C.columns
  const parts = [
    `${cols.visitors.label} ${row.visitors === null ? DASH : n(row.visitors)}`,
    `${cols.signups.label} ${n(row.signups)}`,
    `${cols.payers.label} ${n(row.payers)}`,
    usd.format(row.net),
  ]
  return (
    <li className={`grid gap-1 py-2.5 ${isQuiet(row) ? 'text-muted-foreground' : ''}`}>
      <MetricLabel id={`growth-source-m-${row.key}`} metric={C.groups[row.key]} className="text-sm" />
      <p className="text-sm tabular-nums">{parts.join(' · ')}</p>
    </li>
  )
}

function SourceTableRow({ row }: { row: SourceRow }) {
  return (
    <tr className={`border-b border-border last:border-0 ${isQuiet(row) ? 'text-muted-foreground' : ''}`}>
      <th scope="row" className="h-11 py-1 text-left font-normal">
        <MetricLabel id={`growth-source-${row.key}`} metric={C.groups[row.key]} />
      </th>
      <td className="py-1 text-right tabular-nums">{row.visitors === null ? DASH : n(row.visitors)}</td>
      <td className="py-1 text-right tabular-nums">{n(row.signups)}</td>
      <td className="py-1 text-right tabular-nums">{n(row.payers)}</td>
      <td className="py-1 text-right tabular-nums">{usd.format(row.net)}</td>
    </tr>
  )
}
