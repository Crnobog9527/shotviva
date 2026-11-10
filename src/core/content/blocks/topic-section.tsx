import { Link } from '../../i18n/ui'
import type { TopicSection } from '../page-content'

// An extra home H2 of three headed cards in the facts-card layout (.mk-free). A card's link is
// a plain in-body link at the end of its text, so crawlers read it as part of the copy.
export function TopicCards({ topic, isLinkEnabled }: { topic: TopicSection; isLinkEnabled: (href: string) => boolean }) {
  const headingId = `${topic.id}-h`
  return (
    <section className="mk-block mk-reveal" aria-labelledby={headingId}>
      <h2 className="mk-h2" id={headingId}>
        {topic.heading}
      </h2>
      <div className="mk-free">
        {topic.cards.map((card) => (
          <article key={card.heading}>
            <h3>{card.heading}</h3>
            <p>
              {card.text}
              {card.link && isLinkEnabled(card.link.href) ? (
                <>
                  {' '}
                  <Link href={card.link.href}>{card.link.anchor}</Link>
                </>
              ) : null}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}
