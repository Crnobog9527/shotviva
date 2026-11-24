import type { ReactNode } from 'react'

import { SiteImage as Image } from '../../ui/site-image'
import { phoneSlot } from '../blocks/phone-sizes'
import type { WishExample, WishlistPromo } from '../page-content'
import type { TemplateRequestsText } from './page-text'

// Each print is a quarter of the content column from 768px; half the phone width below it.
const PRINT_SIZES = `(min-width: 1024px) 170px, (min-width: 768px) 22vw, ${phoneSlot(46)}`

const Heart = () => (
  <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" />
  </svg>
)

// One example wish as the Wishlist tab draws it: a print taped to the wall showing the look
// wished for, the wish, and its votes; the shipped one carries the stamp. The picture stays clean
// (The No Badge Rule): the alt text, the intro and the note say "example".
function Print({ wish, labels }: { wish: WishExample; labels: WishlistPromo['labels'] }) {
  return (
    <article className="mk-wish-print">
      {wish.shipped ? (
        <span className="mk-wish-stamp" aria-hidden>
          {labels.shipped}
        </span>
      ) : null}
      <Image src={wish.image.src} alt={wish.image.alt} width={wish.image.width} height={wish.image.height} sizes={PRINT_SIZES} loading="lazy" />
      <p className="mk-wish-text">{wish.text}</p>
      <p className="mk-wish-votes">
        <span aria-hidden>
          <Heart />
          {wish.votes}
        </span>
        <span className="sr-only">{`${wish.shipped ? `${labels.shipped} · ` : ''}${wish.votes} ${labels.votes}`}</span>
      </p>
    </article>
  )
}

// H2-2 (Owner 2026-11-25): the home page's former wishlist showcase, eight fictional example
// wishes. Real requests never appear on this public page: they stay on the signed-in wishlist,
// which the section's button opens.
export function ExampleWall({ text, voteCta }: { text: TemplateRequestsText['examples']; voteCta: ReactNode }) {
  const { wall } = text
  return (
    <section className="mk-block mk-reveal mk-wish" aria-labelledby="examples-h">
      <h2 className="mk-h2" id="examples-h">
        {text.heading}
      </h2>
      <p className="mk-intro">{text.intro}</p>
      <ul className="mk-wish-wall">
        {wall.examples.map((wish) => (
          <li key={wish.text}>
            <Print wish={wish} labels={wall.labels} />
          </li>
        ))}
      </ul>
      <p className="mk-cap mk-wish-note">{wall.note}</p>
      {voteCta ? <div className="mt-4">{voteCta}</div> : null}
    </section>
  )
}
