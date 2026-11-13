'use client'

/* eslint-disable @next/next/no-img-element -- static screenshots at fixed sizes; next/image would re-encode the webp files that were sized for this dialog */
import { Maximize2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '../../../ui/cn'
import type { IntroShot } from './intro-shots'

// What pressing a thumbnail does, told which screenshot and which button it was.
export type ViewShot = (index: number, from: HTMLElement) => void

// A screenshot as a button that opens it large. Its name says so, then what the screenshot is.
// The file is twice the size it is shown at, its box is held by width and height before it
// arrives, and the browser fetches it lazily.
export function ShotThumb({ shot, index, onView, className }: { shot: IntroShot; index: number; onView: ViewShot; className: string }) {
  const t = useTranslations('partner.intro')
  return (
    <button
      type="button"
      data-shot={shot.key}
      aria-label={t('zoom', { name: t(`shots.${shot.key}.name`) })}
      onClick={event => onView(index, event.currentTarget)}
      className={cn('press group relative block w-full overflow-hidden rounded-inner bg-muted shadow-[inset_0_0_0_1px_var(--border)]', className)}
    >
      <img
        src={shot.thumb.src}
        alt=""
        width={shot.thumb.width}
        height={shot.thumb.height}
        loading="lazy"
        decoding="async"
        className="block size-full object-cover object-top"
      />
      <span aria-hidden className="absolute right-2 bottom-2 grid size-7 place-items-center rounded-full bg-[rgba(11,10,9,0.72)] text-foreground backdrop-blur-sm">
        <Maximize2 className="size-3.5" strokeWidth={2.2} />
      </span>
    </button>
  )
}
