import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import type { FaqItem, FaqTable } from '../page-content'

type Props = {
  faq: readonly FaqItem[]
  heading?: string
  isLinkEnabled?: (href: string) => boolean
  // 'accordion' (home, DESIGN v3-b): each Q&A is a <details>, the first one open. The answers
  // stay in the server HTML either way (建站规格 G6, G11).
  variant?: 'list' | 'accordion'
}

// A comparison right after an answer (建站规格 G6 D), as a real table so AI answers can lift it
// (G5). The first cell of each row names the row.
export function FaqTableView({ table }: { table: FaqTable }) {
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

function Answer({ item, enabled }: { item: FaqItem; enabled: (href: string) => boolean }) {
  return (
    <>
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
    </>
  )
}

const plus = (
  <span className="mk-pm" aria-hidden>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  </span>
)

// <h3> + <p>, never div soup, so crawlers read each Q&A; every answer is in the server HTML
// (建站规格 G11). In the accordion the <h3> sits inside <summary>, which allows one heading.
export function FaqSection({ faq, heading, isLinkEnabled, variant = 'list' }: Props) {
  const t = useTranslations('marketing')
  const enabled = isLinkEnabled ?? (() => true)
  if (variant === 'accordion') {
    return (
      <section className="mk-block mk-reveal" aria-labelledby="faq-h">
        <h2 className="mk-h2" id="faq-h">
          {heading ?? t('faq')}
        </h2>
        <div className="mk-faq">
          {faq.map((item, i) => (
            <details key={item.question} open={i === 0}>
              <summary>
                <h3>{item.question}</h3>
                {plus}
              </summary>
              <Answer item={item} enabled={enabled} />
            </details>
          ))}
        </div>
      </section>
    )
  }
  return (
    <section>
      <h2>{heading ?? t('faq')}</h2>
      {faq.map((item) => (
        <div key={item.question}>
          <h3>{item.question}</h3>
          <Answer item={item} enabled={enabled} />
        </div>
      ))}
    </section>
  )
}
