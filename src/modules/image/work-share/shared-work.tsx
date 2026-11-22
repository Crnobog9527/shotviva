'use client'

import { CompareSlider } from '../catalogue/compare-slider'
import { GroundedImg } from '../result/grounded-img'

export type SharedWorkItem = { jobId: string; afterUrl: string; beforeUrl: string | null; alt: string; caption: string; notes: string[] }

// One work of a shared collection: the compare slider (drag, or tap to jump) when the sharer
// showed the original and it is still there, otherwise the result alone. The after ground is
// white, so a cut-out reads as one; every image is lazy but the first, which may be the page's
// largest paint.
export function SharedWork({ item, first }: { item: SharedWorkItem; first: boolean }) {
  return (
    <figure className="grid gap-2">
      {item.beforeUrl ? (
        <CompareSlider before={item.beforeUrl} after={item.afterUrl} afterAlt={item.alt} />
      ) : (
        <span className="hairline relative block aspect-[4/5] overflow-hidden rounded-media bg-muted">
          <GroundedImg
            src={item.afterUrl}
            alt={item.alt}
            ground="white"
            loading={first ? 'eager' : 'lazy'}
            fetchPriority={first ? 'high' : 'auto'}
            decoding="async"
            className="absolute inset-0 size-full object-contain"
          />
        </span>
      )}
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <b className="text-body font-semibold">{item.caption}</b>
        {item.notes.length > 0 ? <small className="text-caption text-muted-foreground">{item.notes.join(' · ')}</small> : null}
      </figcaption>
    </figure>
  )
}
