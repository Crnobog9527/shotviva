import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import type { FaqItem } from '../page-content'

type Props = { faq: readonly FaqItem[]; heading?: string; isLinkEnabled?: (href: string) => boolean }

// <h3> + <p>, never div soup, so crawlers read each Q&A (建站规格 G11).
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
                {' '}
                <Link href={item.link.href}>{item.link.anchor}</Link>
              </>
            )}
          </p>
        </div>
      ))}
    </section>
  )
}
