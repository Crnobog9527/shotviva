import Image from 'next/image'
import type { ReactNode } from 'react'

import type { WishExample, WishlistPromo } from '../page-content'

// Each print is a quarter of the content column from 768px; half the phone width below it.
const PRINT_SIZES = '(min-width: 1024px) 170px, (min-width: 768px) 22vw, 46vw'

const Heart = () => (
  <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" />
  </svg>
)

// One example wish as the Wishlist tab draws it: a print taped to the wall showing the look
// wished for, the wish in the serif's hand, and its votes; the shipped one carries the stamp. The
// picture stays clean (The No Badge Rule): the alt text and the section's note say "example".
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

// Right under the template grid (Owner 2026-11-10): for the visitor whose niche the grid does
// not cover. Three pains, answered in order, then eight example wishes, the note, and the one
// ghost CTA, which is a request-time slot (signed in or not) so the section stays static.
export function WishlistSection({ block, cta }: { block: WishlistPromo; cta: ReactNode }) {
  return (
    <section className="mk-block mk-reveal mk-wish" id="wishlist" aria-labelledby="wish-h">
      <h2 className="mk-h2" id="wish-h">
        {block.heading.lead}
        <em>{block.heading.emphasis}</em>
        {block.heading.tail}
      </h2>
      <p className="mk-intro">{block.intro}</p>
      <ul className="mk-wish-points">
        {block.points.map((point) => (
          <li key={point.heading}>
            <h3>{point.heading}</h3>
            <p>{point.text}</p>
          </li>
        ))}
      </ul>
      <ul className="mk-wish-wall">
        {block.examples.map((wish) => (
          <li key={wish.text}>
            <Print wish={wish} labels={block.labels} />
          </li>
        ))}
      </ul>
      <p className="mk-cap mk-wish-note">{block.note}</p>
      <div className="mk-wish-act">{cta}</div>
    </section>
  )
}
