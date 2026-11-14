import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/core/i18n/ui'
import type { Translate } from '@/core/translate'
import { viewHref } from './format'
import type { Query } from './models'

// A table on desktop; on a phone each row becomes a stacked card that labels its own cells.
export function Table({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="af-empty">{empty}</p>
  return (
    <div className="af-table-wrap" role="region" aria-label={headers.join(' · ')} tabIndex={0}>
      <table className="af-table">
        <thead>
          <tr>
            {headers.map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} data-label={headers[j]}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
