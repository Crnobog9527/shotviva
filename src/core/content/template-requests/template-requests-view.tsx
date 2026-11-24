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
    <header className="px-(--gutter) pt-4 md:max-w-[720px] md:pt-10 lg:pt-12">
      <h1 className="font-display text-h1 leading-[1.05] tracking-[-0.02em] text-balance md:text-title">{text.h1}</h1>
      <p className="mt-3 text-body text-pretty text-bone-dim">{text.intro}</p>
      {open ? (
        <p className="mt-5 flex flex-wrap gap-3">
          <Link href="/wishlist/new" prefetch={false} className="mk-cta md:w-auto">
            {text.cta.submit}
          </Link>
          <Link href="/wishlist" prefetch={false} className="mk-ghost-btn">
            {text.cta.vote}
          </Link>
        </p>
      ) : (
        <p className="mt-5 text-body text-bone-dim">{text.closed}</p>
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
      <ol className="mt-5 grid gap-3 md:gap-4 xl:grid-cols-3">
        {text.items.map((step, i) => (
          <li key={step.heading} className="rounded-tile bg-card p-4 shadow-[inset_0_0_0_1px_var(--input)] md:p-5">
            <span className="font-display text-h2 leading-none text-primary" aria-hidden>
              {i + 1}
            </span>
            <h3 className="mt-3 text-body font-semibold">{step.heading}</h3>
            <p className="mt-1.5 text-body leading-[1.45] text-pretty text-bone-dim">{step.text}</p>
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
      <dl className="mt-5 grid gap-4 xl:grid-cols-3">
        {text.points.map((point) => (
          <div key={point.heading}>
            <dt className="text-body font-semibold">{point.heading}</dt>
            <dd className="mt-1 text-body leading-[1.45] text-pretty text-bone-dim">{point.text}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-7 text-body font-semibold">{text.examplesHeading}</h3>
      <ul className="mt-3 grid gap-3">
        {text.examples.map((example) => (
          <li key={example} className="rounded-tile border-l-2 border-primary bg-card px-4 py-3 text-body leading-[1.45] text-pretty">
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
    <Link href="/wishlist" prefetch={false} className="mk-ghost-btn inline-flex">
      {text.cta.vote}
    </Link>
  ) : null
  return (
    <article className="mk-w pb-16">
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
