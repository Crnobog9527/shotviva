import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import type { TopicSection } from '../page-content'
import { CardVisual } from './card-visual'

// An extra home H2 of three headed cards in the facts-card layout (.mk-free), each led by its
// picture. A card's link is a plain in-body link at the end of its text, so crawlers read it as
// part of the copy. On a phone the cards stay closed under the heading until the visitor opens
// them (Owner 2026-11-24: not a restaurant or hotel topic); a CSS-only toggle, so the cards and
// their links stay in the HTML.
export function TopicCards({ topic, isLinkEnabled }: { topic: TopicSection; isLinkEnabled: (href: string) => boolean }) {
  const t = useTranslations('marketing.home')
  const headingId = `${topic.id}-h`
  const toggleId = `${topic.id}-open`
  return (
    <section className="mk-block mk-reveal" aria-labelledby={headingId}>
      <h2 className="mk-h2" id={headingId}>
        {topic.heading}
      </h2>
      <input type="checkbox" id={toggleId} className="mk-fold-toggle sr-only" />
      <label htmlFor={toggleId} className="mk-ghost-btn mk-fold-btn">
        {t('foldOpen')}
      </label>
      <div className="mk-free mk-fold-body">
        {topic.cards.map((card) => (
          <article key={card.heading}>
            <CardVisual visual={card.visual} />
            <h3>{card.heading}</h3>
            <p>
              {card.text}
              {card.link && isLinkEnabled(card.link.href) ? (
                <>
                  {' '}
                  <Link href={card.link.href}>{card.link.anchor}</Link>
                  {card.after}
                </>
              ) : null}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}
