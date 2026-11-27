import { useTranslations } from 'next-intl'

import type { HeroStripBlock, HeroStripItem } from '../page-content'
import { PhotoPair } from './photo-pair'

// One plate of a strip pair: about 140 px on a phone, 120 px from 768 (marketing.css).
const STRIP_SIZES = '(min-width: 768px) 120px, 140px'

// More real pairs under the first screen (ARCHITECTURE §16.5). Lazy and small: nothing here is
// part of the first paint. A row that scrolls sideways on a phone and wraps into a grid on wider
// screens. A pair read from a live template (the admin's 「更多真实案例」) is a button: pressing it
// loads that template into the first-screen generator above (data-pick-template, as the template
// cards do), which scrolls into view ready for a photo.
export function HeroStrip({ strip }: { strip: HeroStripBlock }) {
  return (
    <section className="mk-hero-strip" aria-label={strip.heading}>
      <h2 className="mk-hero-strip-h">{strip.heading}</h2>
      <ul className="mk-hero-strip-list">
        {strip.items.map((item, index) => (
          // Two picks can share a template (one on its own, one leading a bundle).
          <li key={`${index}-${item.after.src}`}>
            {item.pick ? <PickPair item={item} pick={item.pick} /> : (
              <figure>
                <PhotoPair before={item.before} after={item.after} sizes={STRIP_SIZES} />
                <figcaption className="mk-cap">{item.caption}</figcaption>
              </figure>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function PickPair({ item, pick }: { item: HeroStripItem; pick: string }) {
  const t = useTranslations('marketing.home')
  const label = item.set ? t('bundleAria', { name: item.caption, template: item.set.showing }) : t('stripPick', { name: item.caption })
  return (
    <button type="button" className="mk-hero-strip-pick" data-pick-template={pick} aria-label={label}>
      <span className="mk-hero-strip-frame">
        <PhotoPair before={item.before} after={item.after} sizes={STRIP_SIZES} />
        {item.set ? <span className="mk-hero-strip-set" aria-hidden>{t('bundleBadge')} · {t('bundleCount', { count: item.set.count })}</span> : null}
      </span>
      <span className="mk-cap">{item.caption}</span>
    </button>
  )
}
