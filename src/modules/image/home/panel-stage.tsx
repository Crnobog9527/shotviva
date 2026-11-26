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

// The first frame's width / height attributes: its shape at the stage's width (CSS sizes the box).
const STAGE_PX = 320

type Inset = { url: string; ratio: number | null; label: string; mine: boolean } | null
// `frameRatio`: keep the frame in this shape whatever the picture's (the random opening keeps the
// page's frame, so nothing below it moves); the picture stays contained in it.
type Props = { name: string; after: string | null; initial: StageCover | null; inset: Inset; frameRatio?: number | null }

// The picture that was on show while the next one takes its place: laid over it and faded out
// (marketing.css .mk-stage-out), a crossfade instead of a dip through the dark fill. `quiet`: the
// picture that came in under it, which needs no fade-in of its own.
function useCrossfade(url: string) {
  const [last, setLast] = useState(url)
  const [leaving, setLeaving] = useState<string | null>(null)
  const [quiet, setQuiet] = useState<string | null>(null)
  if (url !== last) {
    setLast(url)
    setLeaving(last)
    setQuiet(url)
  }
  return { leaving, quiet, done: () => setLeaving(null) }
}

// The template's result, whole: contained in a frame of its own shape (bounded), the space the
// bounds leave filled with a blurred, darkened copy of the same picture; never cropped, never
// stretched (Owner 2026-11-12, 方案 B). The fill is a 32 px copy, so it costs nothing and never
// counts as the page's largest picture.
export function PanelStage({ name, after, initial, inset, frameRatio }: Props) {
  const t = useTranslations('home.generator')
  const tags = useTranslations('marketing.home')
  const cover = useStageCover(after, initial)
  return (
    <div className="mk-stage-wrap">
      <div className="mk-stage" style={stageStyle(cover, frameRatio)}>
        {cover ? <StagePicture cover={cover} alt={t('stageAlt', { name })} /> : null}
        {cover ? (
          <span className="mk-tag mk-tag-r mk-stage-ai" aria-hidden>
            {tags('ai')}
          </span>
        ) : null}
        {inset ? <StageInset key={inset.url} inset={inset} alt={inset.mine ? t('originalPhotoAlt') : tags('beforeAlt', { name })} /> : null}
      </div>
    </div>
  )
}

// --r: the frame's shape (bounded); --pr: the picture's own, for the box it is drawn in.
function stageStyle(cover: StageCover | null, frameRatio: number | null | undefined): CSSProperties {
  const ratio = cover?.ratio ?? 4 / 5
  return { '--r': clampRatio(frameRatio ?? ratio), '--pr': ratio } as CSSProperties
}

function StagePicture({ cover, alt }: { cover: StageCover; alt: string }) {
  const fade = useCrossfade(cover.url)
  return (
    <>
      <img className="mk-stage-fill" {...thumbImage(cover.url, 32)} alt="" aria-hidden loading="lazy" decoding="async" />
      {/* The picture's own box, on white: a transparent cut-out reads as on white, as on
          every other cover; the blurred fill shows only outside it. */}
      <span className="mk-stage-pic">
        {/* The opening cover's first frame, painted with the document, under the full picture. */}
        {cover.firstFrame ? <img className="mk-stage-ff" src={cover.firstFrame} width={STAGE_PX} height={Math.round(STAGE_PX / cover.ratio)} alt="" aria-hidden decoding="sync" /> : null}
        <img key={cover.url} className={fade.quiet === cover.url ? 'mk-stage-img mk-stage-quiet' : 'mk-stage-img'} {...stageImage(cover.url)} alt={alt} loading="lazy" decoding="async" />
      </span>
      {fade.leaving ? <img key={fade.leaving} className="mk-stage-out" {...stageImage(fade.leaving)} alt="" aria-hidden onAnimationEnd={fade.done} /> : null}
    </>
  )
}

// The phone photo it started from (the template's own, or the visitor's once picked), small at
// the bottom right, contained in its own shape: the known one, else the one it shows on load.
function StageInset({ inset, alt }: { inset: NonNullable<Inset>; alt: string }) {
  const [loaded, setLoaded] = useState<number | null>(null)
  const style = { '--ir': clampRatio(inset.ratio ?? loaded ?? 4 / 5) } as CSSProperties
  const image = inset.mine ? { src: inset.url, width: 120, height: 150 } : thumbImage(inset.url, 120)
  return (
    <span className="mk-inset" style={style}>
      <img className={inset.mine ? `${REPLAY_BLOCK_CLASS} mk-inset-img` : 'mk-inset-img'} {...image} alt={alt} loading="lazy" decoding="async"
        onLoad={(event) => setLoaded(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} />
      <span className="mk-tag mk-tag-l mk-inset-tag" aria-hidden>
        {inset.label}
      </span>
    </span>
  )
}
