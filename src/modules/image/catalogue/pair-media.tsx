/* eslint-disable @next/next/no-img-element -- the optimiser's srcset on a plain <img> (coverImage),
   so the plates keep their hover-wipe markup */
import { cn } from '@/core/ui/cn'
import { coverImage } from '@/core/ui/cover-image'

import { GroundedImg } from '../result/grounded-img'
import { SplitTags } from './split-tags'

type Props = {
  before: string
  after: string
  alt: string
  eager?: boolean
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
export function PairMedia({ before, after, alt, eager = false, video, size = 'card', sizes, className }: Props) {
  const loading = eager ? 'eager' : 'lazy'
  return (
    <span className={cn('hairline relative isolate grid aspect-[8/5] grid-cols-2 overflow-hidden bg-muted', size === 'card' ? 'rounded-control' : 'rounded-media', className)}>
      <BeforePlate src={before} sizes={sizes} loading={loading} />
      <span className="relative flex items-center justify-center overflow-hidden">
        <Backdrop src={before} sizes={sizes} loading={loading} />
        <img {...coverImage(before, sizes)} alt="" aria-hidden="true" loading={loading} decoding="async" className="absolute inset-0 size-full object-contain saturate-[.85]" />
        <span data-wipe="ai" className="absolute inset-0 z-1 flex items-center justify-center overflow-hidden">
          <Backdrop src={after} sizes={sizes} loading={loading} />
          {/* White behind the result: a transparent cut-out cover reads as white, not as the phone photo underneath. */}
          <GroundedImg ground="white" {...coverImage(after, sizes)} alt={alt} loading={loading} decoding="async" fitPlate={size === 'card'} style={fitImage(size)} className="relative z-1 object-contain" />
        </span>
        {video ? <video data-wipe="video" data-src={video} muted playsInline preload="none" aria-hidden="true" className="absolute inset-0 z-2 size-full object-cover opacity-0" /> : null}
        <span data-wipe="seam" aria-hidden="true" className="absolute inset-y-0 left-0 z-3 -ml-px w-0.5 bg-primary opacity-0" />
      </span>
      <span aria-hidden="true" className="absolute inset-y-0 left-1/2 z-3 w-px bg-[var(--input)]" />
      <SplitTags size={size} />
    </span>
  )
}

function BeforePlate({ src, sizes, loading }: { src: string; sizes: string; loading: 'eager' | 'lazy' }) {
  return <span className="relative overflow-hidden">
    <Backdrop src={src} sizes={sizes} loading={loading} />
    <img {...coverImage(src, sizes)} alt="" loading={loading} decoding="async" className="absolute inset-0 size-full object-contain saturate-[.85]" />
  </span>
}

function Backdrop({ src, sizes, loading }: { src: string; sizes: string; loading: 'eager' | 'lazy' }) {
  return <img {...coverImage(src, sizes)} alt="" aria-hidden="true" loading={loading} decoding="async" className="absolute inset-0 size-full scale-110 object-cover blur-xl brightness-50" />
}
