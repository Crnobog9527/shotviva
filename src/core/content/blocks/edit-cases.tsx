import { SiteImage as Image } from '@/core/ui/site-image'

import type { EditCases } from '../page-content'
import { phoneSlot } from './phone-sizes'

// One plate of a case pair: half of the full-width pair on a phone, a quarter of the row from
// 768 (two cases side by side), 276 px from 1024 (the 1120 px content row, two cases with a
// 16 px gap; three cases make it about 181 px, so the same files serve). The reference inset is about a third of a plate.
const PLATE_SIZES = `(min-width: 1024px) 276px, (min-width: 768px) 25vw, ${phoneSlot(50)}`
const REFERENCE_SIZES = '(min-width: 1024px) 96px, (min-width: 768px) 9vw, 17vw'

// "Change one thing, keep the rest" (landing pages): finished pictures edited precisely, each
// as a before/after pair with what changed in one line. Server-rendered, no client JS; every
// image is below the fold, so all of them load lazily.
export function EditCasesSection({ edits }: { edits: EditCases }) {
  const { labels } = edits
  return (
    <section className="mk-block mk-reveal" id="edits" aria-labelledby="edits-h">
      <h2 className="mk-h2" id="edits-h">
        {edits.heading}
      </h2>
      <p className="mk-intro">{edits.intro}</p>
      <ul className={edits.items.length === 3 ? 'mk-edits mk-edits-3' : 'mk-edits'}>
        {edits.items.map((item) => (
          <li key={item.title}>
            <figure className="mk-edit">
              <span className="mk-pair mk-pair-lg mk-pair-edit">
                <span className="mk-pane">
                  <Image src={item.before.src} alt={item.before.alt} width={item.before.width} height={item.before.height} sizes={PLATE_SIZES} loading="lazy" />
                  {item.reference ? (
                    <span className="mk-ref">
                      <Image src={item.reference.src} alt={item.reference.alt} width={item.reference.width} height={item.reference.height} sizes={REFERENCE_SIZES} loading="lazy" />
                      <span className="mk-ref-tag" aria-hidden>
                        {labels.reference}
                      </span>
                    </span>
                  ) : null}
                </span>
                <span className={item.transparent ? 'mk-pane mk-pane-checker' : 'mk-pane'}>
                  <Image src={item.after.src} alt={item.after.alt} width={item.after.width} height={item.after.height} sizes={PLATE_SIZES} loading="lazy" />
                </span>
                <span className="mk-hl" aria-hidden />
                <span className="mk-tag mk-tag-l" aria-hidden>
                  {labels.before}
                </span>
                <span className="mk-tag mk-tag-r" aria-hidden>
                  {labels.after}
                </span>
              </span>
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
