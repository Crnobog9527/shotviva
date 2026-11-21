import { Fragment, type ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/core/i18n/ui'
import type { Translate } from '@/core/translate'
import { viewHref } from './format'
import type { Query } from './models'

// A table on desktop; on a phone each row becomes a stacked card that labels its own cells.
// `details` (one entry per row, null for none) adds a full-width line under that row, inside the same card.
export function Table({
  headers,
  rows,
  empty,
  details,
}: {
  headers: string[]
  rows: ReactNode[][]
  empty: string
  details?: (ReactNode | null)[]
}) {
  if (!rows.length) return <p className="af-empty">{empty}</p>
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
