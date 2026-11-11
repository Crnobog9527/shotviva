import Image from 'next/image'
import type { CSSProperties } from 'react'

import type { CardVisual as Visual, ImageRef } from '../page-content'

import './explainer.css'

// The picture that leads a how-to point (Owner 2026-11-12): what the step looks like, so the
// line of text under it only has to name it. Every picture sits below the fold, so next/image
// loads it lazily; the plate keeps its size before it arrives, so nothing shifts.
export function CardVisual({ visual }: { visual: Visual }) {
  return <figure className="xv">{body(visual)}</figure>
}

function body(visual: Visual) {
  switch (visual.kind) {
    case 'upload':
      return <UploadVisual image={visual.image} file={visual.file} />
    case 'picker':
      return <PickerVisual visual={visual} />
    case 'pair':
      return <PairVisual visual={visual} />
    case 'sizes':
      return <SizesVisual visual={visual} />
  }
}

const img = (image: ImageRef, sizes: string, decorative = false) => (
  <Image src={image.src} alt={decorative ? '' : image.alt} width={image.width} height={image.height} sizes={sizes} />
)

// Drawn icons, one stroke weight (1.75) like the rest of the marketing pages.
const UploadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
  </svg>
)
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)
const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

function UploadVisual({ image, file }: { image: ImageRef; file: string }) {
  return (
    <div className="xv-up">
      {img(image, '(min-width: 768px) 96px, 36vw')}
      <span className="xv-file">
        <UploadIcon />
        {file}
      </span>
    </div>
  )
}

function PickerVisual({ visual }: { visual: Extract<Visual, { kind: 'picker' }> }) {
  return (
    <>
      <ul className="xv-pick" aria-hidden>
        {visual.tiles.map((tile, i) => (
          <li key={tile.name} className={i === visual.picked ? 'xv-on' : undefined}>
            {img(tile.image, '48px', true)}
            {tile.name}
            {i === visual.picked ? <CheckIcon /> : null}
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">{visual.caption}</figcaption>
    </>
  )
}

function PairVisual({ visual }: { visual: Extract<Visual, { kind: 'pair' }> }) {
  const sizes = '(min-width: 768px) 120px, 45vw'
  return (
    <div className="xv-pair">
      <span>
        {img(visual.before, sizes)}
        <b className="xv-tag">{visual.tags.before}</b>
      </span>
      <i className="xv-to">
        <ArrowIcon />
      </i>
      <span>
        {img(visual.after, sizes)}
        <b className="xv-tag">{visual.tags.after}</b>
      </span>
    </div>
  )
}

// Largest first: each smaller copy sits on top, sharing the bottom-left corner, at its true share
// (--r) of the largest size; a safelight rule runs from each copy's top-right corner to its label,
// and the labels line up in one column right of the largest copy.
function SizesVisual({ visual }: { visual: Extract<Visual, { kind: 'sizes' }> }) {
  const largest = Math.max(...visual.tiers.map((tier) => tier.px))
  const tiers = [...visual.tiers].sort((a, b) => b.px - a.px)
  return (
    <div className="xv-sizes">
      {tiers.map((tier, i) => {
        const share = { '--r': tier.px / largest } as CSSProperties
        return (
          <span key={tier.px} className="xv-size" style={share}>
            {img(visual.image, '(min-width: 768px) 96px, 40vw', i > 0)}
            <i className="xv-rule" aria-hidden />
            <span className="xv-lbl">
              {tier.name} <b>{tier.px}</b>
            </span>
          </span>
        )
      })}
    </div>
  )
}
