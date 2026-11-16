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
  contain?: boolean
  // Rendered width of ONE plate (half the pair), for the covers' srcset.
  sizes: string
  className?: string
}

const shouldContain = (contain: boolean, size: Props['size']) => contain || size === 'pair' || size === 'thumb'

// The side-by-side pair (DESIGN §6.9 item 1, B comp app.css .pair): one 8:5 frame, the phone
// photo on the left plate and the AI result on the right, a hairline between them, "Phone" and
// "AI" on the bottom corners. The right plate keeps the phone photo under the result and a
// safelight seam for the hover wipe (useHoverWipe finds them by data-wipe).
export function PairMedia({ before, after, alt, eager = false, video, size = 'card', contain = false, sizes, className }: Props) {
  const loading = eager ? 'eager' : 'lazy'
  const phone = coverImage(before, sizes)
  const fit = shouldContain(contain, size)
  const plate = cn('absolute inset-0 size-full', fit
    ? 'object-contain' : 'object-cover')
  return (
    <span className={cn('hairline relative isolate grid aspect-[8/5] grid-cols-2 overflow-hidden bg-muted', size === 'card' ? 'rounded-control' : 'rounded-media', className)}>
      <BeforePlate src={before} sizes={sizes} loading={loading} fit={fit} plate={plate} />
      <span className="relative overflow-hidden" style={fit ? { display: 'flex', alignItems: 'center', justifyContent: 'center' } : undefined}>
        {fit ? <Backdrop src={after} sizes={sizes} loading={loading} /> : <img {...phone} alt="" loading={loading} decoding="async" className={cn(plate, 'saturate-[.85]')} />}
        {/* White behind the result: a transparent cut-out cover reads as white, not as the phone photo underneath. */}
        <GroundedImg data-wipe="ai" ground="white" {...coverImage(after, sizes)} alt={alt} loading={loading} decoding="async" style={fit ? { maxHeight: '100%', maxWidth: '100%' } : undefined} className={fit ? 'relative z-1 object-contain' : cn(plate, 'z-1')} />
        {video ? <video data-wipe="video" data-src={video} muted playsInline preload="none" aria-hidden="true" className="absolute inset-0 z-2 size-full object-cover opacity-0" /> : null}
        <span data-wipe="seam" aria-hidden="true" className="absolute inset-y-0 left-0 z-3 -ml-px w-0.5 bg-primary opacity-0" />
      </span>
      <span aria-hidden="true" className="absolute inset-y-0 left-1/2 z-3 w-px bg-[var(--input)]" />
      <SplitTags size={size} />
    </span>
  )
}

function BeforePlate({ src, sizes, loading, fit, plate }: { src: string; sizes: string; loading: 'eager' | 'lazy'; fit: boolean; plate: string }) {
  return <span className="relative overflow-hidden">
    {fit ? <Backdrop src={src} sizes={sizes} loading={loading} /> : null}
    <img {...coverImage(src, sizes)} alt="" loading={loading} decoding="async" className={cn(plate, 'saturate-[.85]')} />
  </span>
}

function Backdrop({ src, sizes, loading }: { src: string; sizes: string; loading: 'eager' | 'lazy' }) {
  return <img {...coverImage(src, sizes)} alt="" aria-hidden="true" loading={loading} decoding="async" className="absolute inset-0 size-full scale-110 object-cover blur-xl brightness-50" />
}
