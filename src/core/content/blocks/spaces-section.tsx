import { SiteImage as Image } from '@/core/ui/site-image'

import type { EditCase, EditCases } from '../page-content'
import { phoneSlot } from './phone-sizes'

// One 16:9 picture: most of the phone width in the rail, half the row from 768.
const PIC_SIZES = `(min-width: 1024px) 544px, (min-width: 768px) 50vw, ${phoneSlot(82)}`

function Pic({ image, tag, ai }: { image: EditCase['before']; tag: string; ai?: boolean }) {
  return (
    <span className="mk-space-pic">
      <Image src={image.src} alt={image.alt} width={image.width} height={image.height} sizes={PIC_SIZES} loading="lazy" />
      <span className={ai ? 'mk-tag mk-tag-r' : 'mk-tag mk-tag-l'} aria-hidden>
        {tag}
      </span>
    </span>
  )
}

// Hotels and stays (Owner 2026-11-24): each case is the phone photo above the result, both
// 16:9 (rooms are wide), with the template and what changed under them. A sideways rail on a
// phone, two to a row from 768. Server-rendered, every picture lazy (below the first screen).
export function SpacesSection({ spaces }: { spaces: EditCases }) {
  const { labels } = spaces
  return (
    <section className="mk-block mk-reveal" id="hotels" aria-labelledby="hotels-h">
      <h2 className="mk-h2" id="hotels-h">
        {spaces.heading}
      </h2>
      <p className="mk-intro">{spaces.intro}</p>
      <ul className="mk-spaces">
        {spaces.items.map((item) => (
          <li key={item.title}>
            <figure className="mk-space">
              <Pic image={item.before} tag={labels.before} />
              <Pic image={item.after} tag={labels.after} ai />
              <figcaption className="mk-edit-cap">
                <b>{item.title}</b>
                <span>{item.change}</span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  )
}
