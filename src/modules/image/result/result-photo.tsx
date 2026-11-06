'use client'

import { useState } from 'react'

import type { CreditPool } from '@/core/billing/pools'

import { GroundedImg } from './grounded-img'
import { TransparencyToggle } from './transparency-toggle'
import { useTransparency } from './use-share-file'
import { WorkTag } from './work-tag'

// The finished photo, full width at its own ratio, never cropped (DESIGN §4.4), with its
// pool's tag: free works are public with a watermark, paid works are private and clean.
// A cut-out (transparent PNG) sits on white by default; the toggle swaps in a checkerboard
// so the see-through parts show. The downloaded file keeps its alpha untouched.
export function ResultPhoto({ src, alt, pool, visibility }: { src: string; alt: string; pool: CreditPool | null; visibility?: 'public' | 'private' }) {
  const transparent = useTransparency(src)
  const [checker, setChecker] = useState(false)
  return (
    <figure className="hairline relative overflow-hidden rounded-panel bg-photo-ground">
      <GroundedImg src={src} alt={alt} ground={transparent && checker ? 'checker' : 'white'} className="block h-auto w-full" />
      {transparent ? <TransparencyToggle pressed={checker} onToggle={() => setChecker((on) => !on)} className="absolute top-3 right-3" /> : null}
      {pool ? <WorkTag pool={pool} visibility={visibility ?? (pool === 'paid' ? 'private' : 'public')} className="absolute bottom-3 left-3" /> : null}
    </figure>
  )
}
