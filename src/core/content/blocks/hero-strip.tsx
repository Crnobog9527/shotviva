import type { HeroStripBlock } from '../page-content'
import { PhotoPair } from './photo-pair'

// One plate of a strip pair: about 140 px on a phone, 120 px from 768 (marketing.css).
const STRIP_SIZES = '(min-width: 768px) 120px, 140px'

// More real pairs of an A/B hero option, right under the first screen (ARCHITECTURE §16.5).
// Lazy and small: nothing here is part of the first paint. A row that scrolls sideways on a
// phone and wraps into a grid on wider screens.
export function HeroStrip({ strip }: { strip: HeroStripBlock }) {
  return (
    <section className="mk-hero-strip" aria-label={strip.heading}>
      <h2 className="mk-hero-strip-h">{strip.heading}</h2>
      <ul className="mk-hero-strip-list">
        {strip.items.map((item) => (
          <li key={item.after.src}>
            <figure>
              <PhotoPair before={item.before} after={item.after} sizes={STRIP_SIZES} />
              <figcaption className="mk-cap">{item.caption}</figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  )
}
