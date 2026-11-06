import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import type { FaqItem, FaqTable } from '../page-content'

type Props = { faq: readonly FaqItem[]; heading?: string; isLinkEnabled?: (href: string) => boolean }

// A comparison right after an answer (建站规格 G6 D), as a real table so AI answers can lift it
// (G5). The first cell of each row names the row.
function FaqTableView({ table }: { table: FaqTable }) {
  const [corner, ...columns] = table.headers
  return (
    <table>
      <caption>{table.caption}</caption>
      <thead>
        <tr>
          <th scope="col">{corner}</th>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map(([label, ...cells]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            {cells.map((cell, i) => (
              <td key={columns[i] ?? i}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// No space between a Chinese full stop and the link that follows it.
const gapAfter = (text: string) => (/[。！？」）]$/.test(text) ? '' : ' ')

// <h3> + <p>, never div soup, so crawlers read each Q&A; every answer is in the server HTML
// (建站规格 G11).
export function FaqSection({ faq, heading, isLinkEnabled }: Props) {
  const t = useTranslations('marketing')
  const enabled = isLinkEnabled ?? (() => true)
  return (
    <section>
      <h2>{heading ?? t('faq')}</h2>
      {faq.map((item) => (
        <div key={item.question}>
          <h3>{item.question}</h3>
          <p>
            {item.answer}
            {item.link && enabled(item.link.href) && (
              <>
                {gapAfter(item.answer)}
                <Link href={item.link.href}>{item.link.anchor}</Link>
              </>
            )}
          </p>
          {item.table && <FaqTableView table={item.table} />}
        </div>
      ))}
    </section>
  )
}
