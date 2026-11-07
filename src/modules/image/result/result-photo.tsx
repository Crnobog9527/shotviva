'use client'

import { useState, type ReactNode } from 'react'

import type { CreditPool } from '@/core/billing/pools'
import { cn } from '@/core/ui/cn'

import { TrayHud } from '../workspace/develop-tray'

import { GroundedImg } from './grounded-img'
import { TransparencyToggle } from './transparency-toggle'
import { useTransparency } from './use-share-file'
import { WorkTag } from './work-tag'

// The finished photo, full width at its own ratio, never cropped (DESIGN §4.4), with its
// pool's tag: free works are public with a watermark, paid works are private and clean.
// A cut-out (transparent PNG) sits on white by default; the toggle swaps in a checkerboard
// so the see-through parts show. The downloaded file keeps its alpha untouched.
// On the workspace's done stage (B comp workspace.html) `hud` puts the tray's pills on top (the
// toggle moves to the bottom corner) and `fit` keeps the whole photo inside the viewport from lg.
const FIT = { on: { figure: 'lg:mx-auto lg:w-fit', img: 'lg:max-h-[calc(100dvh-220px)] lg:w-auto lg:max-w-full' }, off: { figure: '', img: '' } }

type Props = { src: string; alt: string; pool: CreditPool | null; visibility?: 'public' | 'private'; hud?: [ReactNode, ReactNode?]; fit?: boolean }

export function ResultPhoto({ src, alt, pool, visibility, hud, fit }: Props) {
  const transparent = useTransparency(src)
  const [checker, setChecker] = useState(false)
  const fitClass = FIT[fit ? 'on' : 'off']
  return (
    <figure className={cn('hairline relative overflow-hidden rounded-panel bg-photo-ground', fitClass.figure)}>
      <GroundedImg src={src} alt={alt} ground={transparent && checker ? 'checker' : 'white'} className={cn('block h-auto w-full', fitClass.img)} />
      {hud ? <TrayHud hud={hud} /> : null}
      {transparent ? <TransparencyToggle pressed={checker} onToggle={() => setChecker((on) => !on)} className={cn('absolute right-3', hud ? 'bottom-3' : 'top-3')} /> : null}
      {pool ? <WorkTag pool={pool} visibility={visibility ?? defaultVisibility(pool)} className="absolute bottom-3 left-3" /> : null}
    </figure>
  )
}

const defaultVisibility = (pool: CreditPool) => (pool === 'paid' ? 'private' : 'public')
