'use client'

/* eslint-disable @next/next/no-img-element -- the optimiser's own URLs (stageImage, thumbImage) or a local object URL */
import { useTranslations } from 'next-intl'
import { useState, type CSSProperties } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'

import { thumbImage } from './thumb-image'
import { stageImage, useStageCover, type StageCover } from './use-stage-cover'

// The frame's shape bounds: a very tall poster or a very wide banner still fits, inside the
// height range the CSS sets (so the panel never jumps more than that between templates).
const clampRatio = (ratio: number) => Math.min(Math.max(ratio, 0.5), 2)

type Inset = { url: string; ratio: number | null; label: string; mine: boolean } | null
type Props = { name: string; after: string | null; initial: StageCover | null; inset: Inset }

// The template's result, whole: contained in a frame of its own shape (bounded), the space the
// bounds leave filled with a blurred, darkened copy of the same picture; never cropped, never
// stretched (Owner 2026-11-12, 方案 B). The fill is a 32 px copy, so it costs nothing and never
// counts as the page's largest picture.
export function PanelStage({ name, after, initial, inset }: Props) {
  const t = useTranslations('home.generator')
  const tags = useTranslations('marketing.home')
  const cover = useStageCover(after, initial)
  const style = { '--r': clampRatio(cover?.ratio ?? 4 / 5) } as CSSProperties
  return (
    <div className="mk-stage-wrap">
      <div className="mk-stage" style={style}>
        {cover ? (
          <>
            <img className="mk-stage-fill" {...thumbImage(cover.url, 32)} alt="" aria-hidden loading="lazy" decoding="async" />
            {/* The opening cover's first frame, painted with the document, under the full picture. */}
            {cover.firstFrame ? <img className="mk-stage-ff" src={cover.firstFrame} alt="" aria-hidden decoding="sync" /> : null}
            <img key={cover.url} className="mk-stage-img" {...stageImage(cover.url)} alt={t('stageAlt', { name })} loading="lazy" decoding="async" />
          </>
        ) : null}
        <span className="mk-tag mk-tag-r mk-stage-ai" aria-hidden>
          {tags('ai')}
        </span>
        {inset ? <StageInset key={inset.url} inset={inset} /> : null}
      </div>
    </div>
  )
}

// The phone photo it started from (the template's own, or the visitor's once picked), small at
// the bottom right, contained in its own shape: the known one, else the one it shows on load.
function StageInset({ inset }: { inset: NonNullable<Inset> }) {
  const [loaded, setLoaded] = useState<number | null>(null)
  const style = { '--ir': clampRatio(inset.ratio ?? loaded ?? 4 / 5) } as CSSProperties
  const image = inset.mine ? { src: inset.url } : thumbImage(inset.url, 120)
  return (
    <span className="mk-inset" style={style}>
      <img className={inset.mine ? `${REPLAY_BLOCK_CLASS} mk-inset-img` : 'mk-inset-img'} {...image} alt="" loading="lazy" decoding="async"
        onLoad={(event) => setLoaded(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} />
      <span className="mk-tag mk-tag-l mk-inset-tag" aria-hidden>
        {inset.label}
      </span>
    </span>
  )
}
