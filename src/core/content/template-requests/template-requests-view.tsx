import type { ReactNode } from 'react'

import { Link } from '../../i18n/ui'
import type { ShippedTemplate } from '../../wishlist'
import { FaqSection } from '../blocks/faq-section'
import { RelatedLinks } from '../blocks/related-links'
import type { TemplateRequestsText } from './page-text'
import { ExampleWall } from './example-wall'
import { ShippedList } from './shipped-list'

type Props = {
  text: TemplateRequestsText
  // Templates built from requests (names only); empty hides the section.
  shipped: readonly ShippedTemplate[]
  // Whether the wishlist is open (ARCHITECTURE §15.6): closed, the page keeps its copy but offers
  // no way into the wishlist, whose pages then 404.
  open: boolean
}

function Hero({ text, open }: Pick<Props, 'text' | 'open'>) {
  return (
    <header className="tr-hero">
      <h1 className="tr-h1">{text.h1}</h1>
      <p className="tr-lede">{text.intro}</p>
      {open ? (
        <p className="tr-actions">
          <Link href="/wishlist/new" prefetch={false} className="mk-cta tr-cta">
            {text.cta.submit}
          </Link>
          <Link href="/wishlist" prefetch={false} className="mk-ghost-btn">
            {text.cta.vote}
          </Link>
        </p>
      ) : (
        <p className="tr-closed">{text.closed}</p>
      )}
    </header>
  )
}

function Steps({ text }: { text: TemplateRequestsText['steps'] }) {
  return (
    <section className="mk-block mk-reveal" aria-labelledby="steps-h">
      <h2 className="mk-h2" id="steps-h">
        {text.heading}
      </h2>
      <ol className="tr-grid">
        {text.items.map((step, i) => (
          <li key={step.heading} className="tr-card">
            <span className="tr-num" aria-hidden>
              {i + 1}
            </span>
            <h3 className="tr-h3">{step.heading}</h3>
            <p className="tr-dim">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function GoodRequest({ text }: { text: TemplateRequestsText['good'] }) {
  return (
    <section className="mk-block mk-reveal" aria-labelledby="good-h">
      <h2 className="mk-h2" id="good-h">
        {text.heading}
      </h2>
      <p className="mk-intro">{text.intro}</p>
      <dl className="tr-grid tr-points">
        {text.points.map((point) => (
          <div key={point.heading}>
            <dt className="tr-strong">{point.heading}</dt>
            <dd className="tr-dim">{point.text}</dd>
          </div>
        ))}
      </dl>
      <h3 className="tr-h3 tr-gap">{text.examplesHeading}</h3>
      <ul className="tr-quotes">
        {text.examples.map((example) => (
          <li key={example} className="tr-quote">
            {example}
          </li>
        ))}
      </ul>
    </section>
  )
}

// /template-requests: hero with the two ways in → how it works → example wishes → recently built
// (only when there is one) → what makes a good request → templates to use today → FAQ.
// No visible breadcrumbs (DESIGN §8); the BreadcrumbList JSON-LD stays.
export function TemplateRequestsView({ text, shipped, open }: Props) {
  const voteCta: ReactNode = open ? (
    <Link href="/wishlist" prefetch={false} className="mk-ghost-btn tr-inline">
      {text.cta.vote}
    </Link>
  ) : null
  return (
    <article className="mk-w tr-page">
      <Hero text={text} open={open} />
      <Steps text={text.steps} />
      <ExampleWall text={text.examples} voteCta={voteCta} />
      <ShippedList text={text.shipped} items={shipped} />
      <GoodRequest text={text.good} />
      <RelatedLinks heading={text.today.heading} links={text.today.links} variant="cards" />
      <FaqSection faq={text.faq} heading={text.faqHeading} variant="accordion" />
    </article>
  )
}
