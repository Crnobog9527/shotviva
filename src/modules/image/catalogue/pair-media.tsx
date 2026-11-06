/* eslint-disable @next/next/no-img-element -- covers are pre-sized WebP on the public assets
   bucket (ARCHITECTURE §8.3, long edge 1600); the image optimizer would only re-encode them. */
import { cn } from '@/core/ui/cn'

import { GroundedImg } from '../result/grounded-img'
import { ExampleBadge, SplitTags } from './split-tags'

// Where "Illustrative example" sits. On the phone the feature's right plate has no room beside
// the AI tag; the page footnote says it there.
const BADGE = {
  card: 'top-2 left-2',
  pair: 'top-3 left-3',
  feature: 'top-3 left-[calc(50%+12px)] max-md:hidden',
}

type Props = {
  before: string
  after: string
  alt: string
  eager?: boolean
  // A video template's loop, played on the right plate by useHoverWipe (or the Quiet Loop).
  video?: string
  size?: 'card' | 'pair' | 'feature'
  badge?: boolean
  className?: string
}

// The side-by-side pair (DESIGN §6.9 item 1, B comp app.css .pair): one 8:5 frame, the phone
// photo on the left plate and the AI result on the right, a hairline between them, "Phone" and
// "AI" on the bottom corners. The right plate keeps the phone photo under the result and a
// safelight seam for the hover wipe (useHoverWipe finds them by data-wipe).
export function PairMedia({ before, after, alt, eager = false, video, size = 'card', badge = false, className }: Props) {
  const loading = eager ? 'eager' : 'lazy'
  const plate = 'absolute inset-0 size-full object-cover transition-transform duration-600 ease-house group-hover:scale-[1.02]'
  return (
    <span className={cn('hairline relative isolate grid aspect-[8/5] grid-cols-2 overflow-hidden bg-muted', size === 'card' ? 'rounded-control' : 'rounded-media', className)}>
      <span className="relative overflow-hidden">
        <img src={before} alt="" loading={loading} decoding="async" className={cn(plate, 'saturate-[.85]')} />
      </span>
      <span className="relative overflow-hidden">
        <img src={before} alt="" loading={loading} decoding="async" className={cn(plate, 'saturate-[.85]')} />
        {/* White behind the result: a transparent cut-out cover reads as white, not as the phone photo underneath. */}
        <GroundedImg data-wipe="ai" ground="white" src={after} alt={alt} loading={loading} decoding="async" className={cn(plate, 'z-1')} />
        {video ? <video data-wipe="video" data-src={video} muted playsInline preload="none" aria-hidden="true" className="absolute inset-0 z-2 size-full object-cover opacity-0" /> : null}
        <span data-wipe="seam" aria-hidden="true" className="absolute inset-y-0 left-0 z-3 -ml-px w-0.5 bg-primary opacity-0" />
      </span>
      <span aria-hidden="true" className="absolute inset-y-0 left-1/2 z-3 w-px bg-[var(--input)]" />
      <SplitTags size={size} />
      {badge ? <ExampleBadge className={BADGE[size]} /> : null}
    </span>
  )
}
