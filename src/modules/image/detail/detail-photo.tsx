'use client'

import { useState } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import type { CreditPool } from '@/core/billing/pools'
import type { JobVisibility } from '@/core/jobs'
import { cn } from '@/core/ui/cn'

import { GroundedImg } from '../result/grounded-img'
import { useTransparency } from '../result/use-share-file'
import { WorkTag } from '../result/work-tag'
import { OriginalLayer } from './original-layer'
import type { OriginalSource } from './photo-detail'
import { ViewChips, viewsFor, type PhotoViewId } from './view-chips'

export type DetailPhotoProps = {
  src: string
  alt: string
  work: { pool: CreditPool; visibility: JobVisibility }
  tierLabel: string
  original: { source: OriginalSource; alt: string }
}

// The result at its own ratio, never cropped (DESIGN §4.4), with its pool tag and tier on top
// and the view chips on the bottom-right (T6 photo.html, T32). A cut-out sits on white by
// default and on the checkerboard under "Transparent" (T31's grounds). "Original" covers the
// frame with the user's upload; the tags step aside since they describe the result.
export function DetailPhoto({ src, alt, work, tierLabel, original }: DetailPhotoProps) {
  const transparent = useTransparency(src)
  const [view, setView] = useState<PhotoViewId>('result')
  const showing = view === 'checker' && !transparent ? 'result' : view
  const onOriginal = showing === 'original'
  return (
    <figure className="hairline relative mx-auto w-full overflow-hidden rounded-panel bg-photo-ground lg:w-fit">
      <GroundedImg src={src} alt={alt} ground={showing === 'checker' ? 'checker' : 'white'} className={`${REPLAY_BLOCK_CLASS} block h-auto w-full lg:max-h-[calc(100dvh-240px)] lg:w-auto lg:max-w-full`} />
      {onOriginal ? <OriginalLayer source={original.source} alt={original.alt} /> : null}
      <div className={cn('pointer-events-none absolute inset-x-3 top-3 flex justify-between gap-2', onOriginal && 'invisible')}>
        <WorkTag pool={work.pool} visibility={work.visibility} />
        <span className="frost inline-flex min-h-[26px] items-center rounded-full px-2 py-1 text-caption leading-none font-semibold text-foreground">{tierLabel}</span>
      </div>
      <ViewChips views={viewsFor(transparent)} value={showing} transparent={transparent} onChange={setView} className="absolute right-3 bottom-3" />
    </figure>
  )
}
