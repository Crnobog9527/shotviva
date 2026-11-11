'use client'

import type { ReactNode } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import type { CreditPool } from '@/core/billing/pools'
import { cn } from '@/core/ui/cn'

import { backgroundForView, ViewChips, viewForBackground } from '../detail/view-chips'
import { TrayHud } from '../workspace/develop-tray'

import { shareSource } from './download-background'
import { GroundedImg } from './grounded-img'
import { useCutOutChoice } from './use-download-background'
import { WorkTag } from './work-tag'

// The finished photo, full width at its own ratio, never cropped (DESIGN §4.4), with its
// pool's tag: free works are public with a watermark, paid works are private and clean.
// A cut-out sits on white by default; its 白底 / 透明 chips (the same as photo detail's) swap in
// a checkerboard and are the download choice: the button below saves the file on show.
// On the workspace's done stage (B comp workspace.html) `hud` puts the tray's pills on top (the
// chips move to the bottom corner) and `fit` keeps the whole photo inside the viewport from lg.
const FIT = { on: { figure: 'lg:mx-auto lg:w-fit', img: 'lg:max-h-[calc(100dvh-220px)] lg:w-auto lg:max-w-full' }, off: { figure: '', img: '' } }

// cutOut: the work's record (null when unknown).
type Props = { src: string; alt: string; pool: CreditPool | null; cutOut?: boolean | null; visibility?: 'public' | 'private'; hud?: [ReactNode, ReactNode?]; fit?: boolean }

export function ResultPhoto({ src, alt, pool, cutOut, visibility, hud, fit }: Props) {
  const [background, choose] = useCutOutChoice(src, { pool, transparent: cutOut })
  const checker = background === 'transparent'
  const fitClass = FIT[fit ? 'on' : 'off']
  return (
    <figure className={cn('hairline relative overflow-hidden rounded-panel bg-photo-ground', fitClass.figure)}>
      <GroundedImg src={checker ? shareSource(src, { pool }, 'transparent') : src} alt={alt} ground={checker ? 'checker' : 'white'} className={cn(REPLAY_BLOCK_CLASS, 'block h-auto w-full', fitClass.img)} />
      {hud ? <TrayHud hud={hud} /> : null}
      {background ? (
        <ViewChips
          views={['result', 'checker']}
          value={viewForBackground(background, false)}
          transparent
          onChange={(view) => choose(backgroundForView(view) ?? 'white')}
          className={cn('absolute right-3', hud ? 'bottom-3' : 'top-3')}
        />
      ) : null}
      {pool ? <WorkTag pool={pool} visibility={visibility ?? defaultVisibility(pool)} className="absolute bottom-3 left-3" /> : null}
    </figure>
  )
}

const defaultVisibility = (pool: CreditPool) => (pool === 'paid' ? 'private' : 'public')
