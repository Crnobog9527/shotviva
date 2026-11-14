import { SiteImage as Image } from '@/core/ui/site-image'
import { useTranslations } from 'next-intl'

import type { Fact, HomePage } from '../page-content'
import { CardVisual } from './card-visual'

// H2-1: "How ... Works in 3 Steps", one H3 per step (建站规格 §4), each with what the step
// looks like under its line of text (under the text on phones, across the step's width when the
// steps stand side by side).
export function StepsSection({ steps }: { steps: HomePage['steps'] }) {
  return (
    <section className="mk-block mk-reveal" aria-labelledby="how-h">
      <h2 className="mk-h2" id="how-h">
        {steps.heading}
      </h2>
      <ol className="mk-steps">
        {steps.items.map((step, i) => (
          <li key={step.heading}>
            <span className="mk-num" aria-hidden>
              {i + 1}
            </span>
            <div>
              <h3>{step.heading}</h3>
              <p>{step.text}</p>
            </div>
            <CardVisual visual={step.visual} />
          </li>
        ))}
      </ol>
    </section>
  )
}

// H2-3: the shared facts as a real two-column table (建站规格 G4, G5); the first two rows, what
// stays and what changes, are set large.
export function HomeFacts({ facts, heading, intro }: { facts: readonly Fact[]; heading: string; intro: string }) {
  return (
    <section className="mk-block mk-reveal" aria-labelledby="same-h">
      <h2 className="mk-h2" id="same-h">
        {heading}
      </h2>
      <p className="mk-intro">{intro}</p>
      <table className="mk-facts">
        <tbody>
          {facts.map((fact, i) => (
            <tr key={fact.label} className={i < 2 ? 'mk-key' : undefined}>
              <th scope="row">{fact.label}</th>
              <td>{fact.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

// The free and the paid version of one photo: the watermark is the only difference.
function WatermarkSample({ sample, brand }: { sample: NonNullable<HomePage['freeOffer']['sample']>; brand: string }) {
  const t = useTranslations('marketing.home')
  return (
    <div className="mk-wm">
      <figure>
        <Image src={sample.src} alt={t('freeSampleAlt')} width={sample.width} height={sample.height} sizes="(min-width: 768px) 120px, 40vw" />
        <span className="mk-mark" aria-hidden>
          {brand.toLowerCase()}
        </span>
        <figcaption className="mk-pill mk-free-tag">{t('freeTag')}</figcaption>
      </figure>
      <figure>
        <Image src={sample.src} alt={t('paidSampleAlt')} width={sample.width} height={sample.height} sizes="(min-width: 768px) 120px, 40vw" />
        <figcaption className="mk-pill mk-paid-tag">{t('paidTag')}</figcaption>
      </figure>
    </div>
  )
}

// H2-4: free credits, free vs paid works, then plans (建站规格 §4).
export function FreeOfferSection({ offer, brand }: { offer: HomePage['freeOffer']; brand: string }) {
  const [gift, watermark] = offer.points
  return (
    <section className="mk-block mk-reveal" aria-labelledby="free-h">
      <h2 className="mk-h2" id="free-h">
        {offer.heading}
      </h2>
      <div className="mk-free">
        <article>
          <h3>{gift.heading}</h3>
          <p>{gift.text}</p>
        </article>
        <article>
          <h3>{watermark.heading}</h3>
          <p>{watermark.text}</p>
          {offer.sample ? <WatermarkSample sample={offer.sample} brand={brand} /> : null}
        </article>
        <article>
          <h3>{offer.plans.heading}</h3>
          <p>{offer.plans.text}</p>
        </article>
      </div>
    </section>
  )
}

// A landing page's verifiable facts (建站规格 R10 ②, G4) as three cards, with where the numbers
// come from under them (design/comps-v3-b/landing.html).
export function FactCards({ facts, heading, note }: { facts: readonly Fact[]; heading: string; note: string }) {
  return (
    <section className="mk-block mk-reveal" aria-labelledby="facts-h">
      <h2 className="mk-h2" id="facts-h">
        {heading}
      </h2>
      <div className="mk-free">
        {facts.map((fact) => (
          <article key={fact.label}>
            <h3>{fact.label}</h3>
            <p>{fact.value}</p>
          </article>
        ))}
      </div>
      <p className="mk-facts-note">{note}</p>
    </section>
  )
}
