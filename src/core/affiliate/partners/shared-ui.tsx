import { Fragment, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/core/i18n/ui'
import type { Translate } from '@/core/translate'
import { viewHref } from './format'
import type { Query } from './models'

// One row of the phone list: what the row is, when, its amount and its state.
export type RowSummary = { title: ReactNode; meta?: ReactNode; value: ReactNode; badge?: ReactNode }

type TableProps = {
  headers: string[]
  rows: ReactNode[][]
  empty: string
  details?: (ReactNode | null)[]
  summaries?: RowSummary[]
}

// A table on desktop; on a phone each row becomes a stacked card that labels its own cells.
// `details` (one entry per row, null for none) adds a full-width line under that row, inside the same card.
// With `summaries` (Owner 2026-11-22: native list rows on a phone), the phone gets one compact row per
// entry instead, which opens in place to the full labelled cells.
export function Table(props: TableProps) {
  if (!props.rows.length) return <p className="af-empty">{props.empty}</p>
  if (!props.summaries) return <WideTable {...props} />
  return (
    <div className="af-has-list">
      <WideTable {...props} />
      <PhoneList {...props} summaries={props.summaries} />
    </div>
  )
}

function PhoneList({ headers, rows, details, summaries }: TableProps & { summaries: RowSummary[] }) {
  return (
    <ul className="af-list" aria-label={headers.join(' · ')}>
      {summaries.map((row, i) => (
        <li key={i}>
          <details>
            <summary>
              <span className="af-list-title">{row.title}</span>
              <span className="af-list-value">{row.value}</span>
              <ChevronDown aria-hidden strokeWidth={1.75} className="af-list-chevron" />
              {row.meta ? <span className="af-list-meta">{row.meta}</span> : null}
              {row.badge ? <span className="af-list-badge">{row.badge}</span> : null}
            </summary>
            <dl className="af-list-more">
              {rows[i].map((cell, j) => (
                <div key={j}>
                  <dt>{headers[j]}</dt>
                  <dd>{cell}</dd>
                </div>
              ))}
            </dl>
            {details?.[i] ? <div className="af-list-extra">{details[i]}</div> : null}
          </details>
        </li>
      ))}
    </ul>
  )
}

function WideTable({ headers, rows, details }: TableProps) {
  const Group = details ? 'tbody' : Fragment
  return (
    <div className="af-table-wrap" role="region" aria-label={headers.join(' · ')} tabIndex={0}>
      <table className={'af-table' + (details ? ' af-table-grouped' : '')}>
        <thead>
          <tr>
            {headers.map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        {details ? null : <tbody>{rows.map((row, i) => <Row key={i} row={row} headers={headers} />)}</tbody>}
        {details && rows.map((row, i) => (
          <Group key={i}>
            <Row row={row} headers={headers} />
            {details[i] && (
              <tr className="af-detail-row">
                <td colSpan={headers.length}>{details[i]}</td>
              </tr>
            )}
          </Group>
        ))}
      </table>
    </div>
  )
}

function Row({ row, headers }: { row: ReactNode[]; headers: string[] }) {
  return (
    <tr>
      {row.map((cell, j) => (
        <td key={j} data-label={headers[j]}>{cell}</td>
      ))}
    </tr>
  )
}

const TONE: Record<string, 'ok' | 'wait' | 'stop'> = {
  confirmed: 'ok', paid: 'ok', active: 'ok',
  pending: 'wait', due: 'wait', on_hold: 'stop', held: 'stop',
  void: 'stop', rejected: 'stop', suspended: 'stop', banned: 'stop',
}

export function StatusPill({ status, t }: { status: string; t: Translate }) {
  return <span className={'af-pill af-pill-' + (TONE[status] ?? 'wait')}>{t('status.' + status)}</span>
}

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="af-section">
      <div className="af-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export async function More({
  query,
  next,
  field = 'cursor',
}: {
  query: Query
  next: string | null
  field?: 'cursor' | 'bonus' | 'changes'
}) {
  if (!next) return null
  const t = await getTranslations('affiliate')
  return (
    <Link className="af-more" href={viewHref({ ...query, [field]: next })}>
      {t('more')}
    </Link>
  )
}
