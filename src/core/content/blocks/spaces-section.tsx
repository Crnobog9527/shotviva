import { SiteImage as Image } from '@/core/ui/site-image'

import type { SpaceCase, SpaceCases } from '../page-content'
import { HotelCasesMount } from './hotel-cases-mount'
import { HOTEL_OPEN_ATTR } from './hotel-cases-dom'
import { phoneSlot } from './phone-sizes'

// One small 16:9 thumbnail: half a case, a case being one column on the phone, half the row from
// 640 and a quarter of the 1024 content column (two cases a row, two pictures a case).
const THUMB_SIZES = `(min-width: 1024px) 200px, (min-width: 640px) 25vw, ${phoneSlot(46)}`

function Thumb({ image, tag, ai }: { image: SpaceCase['before']; tag: string; ai?: boolean }) {
  return (
    <span className="hc-pic">
      <Image src={image.src} alt={image.alt} width={image.width} height={image.height} sizes={THUMB_SIZES} loading="lazy" />
      <span className={ai ? 'hc-tag hc-ai' : 'hc-tag'} aria-hidden>
        {tag}
      </span>
    </span>
  )
}

// Hotels and stays (Owner 2026-11-25): four cases in a compact list, each a small pair (the real
// phone photo left, the result right) with the case's name and one line under it. Pressing a
// case opens the full-size viewer (hotel-case-viewer.tsx, whose code loads on that first press);
// phones show the first two cases and a "See all 4" button that opens the viewer, which pages
// through all four. Before hydration the cases are plain pictures and text. Every picture lazy.
export function SpacesSection({ spaces }: { spaces: SpaceCases }) {
  const { labels } = spaces
  return (
    <section className="mk-block mk-reveal" id="hotels" aria-labelledby="hotels-h">
      <h2 className="mk-h2" id="hotels-h">
        {spaces.heading}
      </h2>
      <p className="mk-intro">{spaces.intro}</p>
      <ul className="hc-list">
        {spaces.items.map((item, index) => (
          <li key={item.title}>
            <button type="button" className="hc-case" {...{ [HOTEL_OPEN_ATTR]: index }}>
              <span className="hc-pair">
                <Thumb image={item.before} tag={labels.before} />
                <Thumb image={item.after} tag={labels.after} ai />
              </span>
              <span className="hc-title">{item.title}</span>
              <span className="hc-change">{item.change}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="hc-more" {...{ [HOTEL_OPEN_ATTR]: 0 }}>
        {spaces.more}
      </button>
      <HotelCasesMount />
    </section>
  )
}
