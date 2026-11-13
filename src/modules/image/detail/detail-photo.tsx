'use client'

import { useState } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import type { CreditPool } from '@/core/billing/pools'
import type { JobVisibility } from '@/core/jobs'
import { cn } from '@/core/ui/cn'

import { shareSource } from '../result/download-background'
import { GroundedImg } from '../result/grounded-img'
import { useCutOutChoice } from '../result/use-download-background'
import { WorkTag } from '../result/work-tag'
import { OriginalLayer } from './original-layer'
import type { OriginalSource } from './photo-detail'
import { backgroundForView, ViewChips, viewForBackground, viewsFor, type PhotoViewId } from './view-chips'

export type DetailPhotoProps = {
  src: string
  alt: string
  // cutOut: the work's record (null when unknown), for the 白底 / 透明 choice.
  work: { pool: CreditPool; visibility: JobVisibility; cutOut?: boolean | null }
  tierLabel: string
  original: { source: OriginalSource; alt: string }
}

// The result at its own ratio, never cropped (DESIGN §4.4), with its pool tag and tier on top
// and the view chips on the bottom-right (T6 photo.html, T32). A cut-out's 白底 / 透明 chips are its
// download choice (ARCHITECTURE §8): white ground or the checkerboard, and the button below saves
// that file; a free work's 透明 shows its marked PNG, the file it would save. "Original" covers the
// frame with the user's upload and changes no download; the tags step aside since they describe
// the result.
export function DetailPhoto({ src, alt, work, tierLabel, original }: DetailPhotoProps) {
  const [background, choose] = useCutOutChoice(src, { pool: work.pool, transparent: work.cutOut })
  const [view, setView] = useState<PhotoViewId>('result')
  const [onOriginal, setOnOriginal] = useState(false)
  const showing = background ? viewForBackground(background, onOriginal) : view
  const pick = (next: PhotoViewId) => {
    if (!background) return setView(next)
    const chosen = backgroundForView(next)
    setOnOriginal(chosen === null)
    if (chosen) choose(chosen)
  }
  const shown = showing === 'original'
  const views = viewsFor(background !== null, original.source.kind !== 'none')
  const image = showing === 'checker' ? shareSource(src, { pool: work.pool }, 'transparent') : src
  return (
    <figure className="hairline relative mx-auto w-full overflow-hidden rounded-panel bg-photo-ground lg:w-fit">
      <GroundedImg src={image} alt={alt} ground={showing === 'checker' ? 'checker' : 'white'} className={`${REPLAY_BLOCK_CLASS} block h-auto w-full lg:max-h-[calc(100dvh-240px)] lg:w-auto lg:max-w-full`} />
      {shown ? <OriginalLayer source={original.source} alt={original.alt} /> : null}
      <div className={cn('pointer-events-none absolute inset-x-3 top-3 flex justify-between gap-2', shown && 'invisible')}>
        <WorkTag pool={work.pool} visibility={work.visibility} />
        <span className="frost inline-flex min-h-[26px] items-center rounded-full px-2 py-1 text-caption leading-none font-semibold text-foreground">{tierLabel}</span>
      </div>
      {views.length > 1 ? <ViewChips views={views} value={showing} transparent={background !== null} onChange={pick} className="absolute right-3 bottom-3" /> : null}
    </figure>
  )
}
