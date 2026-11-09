import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/core/i18n/ui'
import { viewHref } from './format'
import type { Query } from './models'

export function Table({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="af-empty">{empty}</p>
  return (
    <div className="af-table-wrap" role="region" aria-label={headers.join(' · ')} tabIndex={0}>
      <table>
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
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <Link className="af-link" href={viewHref({ ...query, [field]: next })}>
      {t('more')}
    </Link>
  )
}
