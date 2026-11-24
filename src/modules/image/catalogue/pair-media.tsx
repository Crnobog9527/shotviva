'use client'

/* eslint-disable @next/next/no-img-element -- the optimiser's srcset on a plain <img> (coverImage),
   so the plates keep their hover-wipe markup */
import { cn } from '@/core/ui/cn'
import { coverAvif, coverImage } from '@/core/ui/cover-image'
import { Picture } from '@/core/ui/picture'

import { GroundedImg } from '../result/grounded-img'
import { useCardCovers } from './near-viewport'
import { SplitTags } from './split-tags'

type Props = {
  before: string
  after: string
  alt: string
  eager?: boolean
  // The first card on the page (near-viewport.tsx useCardCovers): its covers load at high priority.
  priority?: boolean
  // A video template's loop, played on the right plate by useHoverWipe (or the Quiet Loop).
  video?: string
  size?: 'card' | 'pair' | 'feature' | 'thumb'
  // Rendered width of ONE plate (half the pair), for the covers' srcset.
  sizes: string
  className?: string
}

const fitImage = (size: Props['size']) => size === 'card'
  ? { width: 'min(100%, var(--image-width, 100%))', height: 'auto', maxHeight: '100%' }
  : { maxHeight: '100%', maxWidth: '100%' }

// The side-by-side pair (DESIGN §6.9 item 1, B comp app.css .pair): one 8:5 frame, the phone
// photo on the left plate and the AI result on the right, a hairline between them, "Phone" and
// "AI" on the bottom corners. The right plate keeps the phone photo under the result and a
// safelight seam for the hover wipe (useHoverWipe finds them by data-wipe).
// Inside Create's grid a card's pictures wait until it nears the screen (near-viewport.tsx); the
// frame, the hairline and the tags are there from the start, so nothing moves when they arrive.
export function PairMedia({ before, after, alt, eager = false, priority = false, video, size = 'card', sizes, className }: Props) {
  const { ref, show, img } = useCardCovers<HTMLSpanElement>(eager, eager && priority)
  return (
    <span ref={ref} className={cn('hairline relative isolate grid aspect-[8/5] grid-cols-2 overflow-hidden bg-muted', size === 'card' ? 'rounded-control' : 'rounded-media', className)}>
      {show ? <BeforePlate src={before} sizes={sizes} img={img} /> : <span />}
      <span className="relative flex items-center justify-center overflow-hidden">
        {show ? (
          <>
            <Backdrop src={before} sizes={sizes} img={img} />
            <Picture avif={coverAvif(before, sizes)}><img {...coverImage(before, sizes)} alt="" aria-hidden="true" {...img} decoding="async" className="absolute inset-0 size-full object-contain saturate-[.85]" /></Picture>
          </>
        ) : null}
        <span data-wipe="ai" className="absolute inset-0 z-1 flex items-center justify-center overflow-hidden bg-muted">
          {show ? (
            <>
              <Backdrop src={after} sizes={sizes} img={img} />
              {/* White behind the result: a transparent cut-out cover reads as white, not as the phone photo underneath. */}
              <Picture avif={coverAvif(after, sizes)}><GroundedImg ground="white" {...coverImage(after, sizes)} alt={alt} {...img} decoding="async" fitPlate={size === 'card'} style={fitImage(size)} className="relative z-1 object-contain" /></Picture>
            </>
          ) : null}
        </span>
        {video ? <video data-wipe="video" data-src={video} muted playsInline preload="none" aria-hidden="true" className="absolute inset-0 z-2 size-full object-cover opacity-0" /> : null}
        <span data-wipe="seam" aria-hidden="true" className="absolute inset-y-0 left-0 z-3 -ml-px w-0.5 bg-primary opacity-0" />
      </span>
      <span aria-hidden="true" className="absolute inset-y-0 left-1/2 z-3 w-px bg-[var(--input)]" />
      <SplitTags size={size} />
    </span>
  )
}

type ImgProps = ReturnType<typeof useCardCovers>['img']

function BeforePlate({ src, sizes, img }: { src: string; sizes: string; img: ImgProps }) {
  return <span className="relative overflow-hidden">
    <Backdrop src={src} sizes={sizes} img={img} />
    <Picture avif={coverAvif(src, sizes)}><img {...coverImage(src, sizes)} alt="" {...img} decoding="async" className="absolute inset-0 size-full object-contain saturate-[.85]" /></Picture>
  </span>
}

function Backdrop({ src, sizes, img }: { src: string; sizes: string; img: ImgProps }) {
  return <Picture avif={coverAvif(src, sizes)}><img {...coverImage(src, sizes)} alt="" aria-hidden="true" {...img} decoding="async" className="absolute inset-0 size-full scale-110 object-cover blur-xl brightness-50" /></Picture>
}
