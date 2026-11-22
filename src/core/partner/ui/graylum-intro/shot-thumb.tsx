'use client'

/* eslint-disable @next/next/no-img-element -- static posters at fixed sizes; next/image would re-encode the webp files */
import { Play } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '../../../ui/cn'
import { type IntroScene, MEDIA_SIZE } from './intro-shots'

// What pressing a tile does, told which scene and which button it was.
export type ViewShot = (index: number, from: HTMLElement) => void

// A scene as a button that opens its animation large. Only the poster shows here, fetched
// lazily, its box held by width and height; the video is not in the grid at all.
export function ShotThumb({ scene, index, onView, className }: { scene: IntroScene; index: number; onView: ViewShot; className?: string }) {
  const t = useTranslations('partner.intro')
  return (
    <button
      type="button"
      data-shot={scene.key}
      aria-label={t('zoom', { name: t(`shots.${scene.key}.label`) })}
      onClick={event => onView(index, event.currentTarget)}
      className={cn('press group relative block aspect-[16/10] w-full overflow-hidden rounded-inner bg-muted shadow-[inset_0_0_0_1px_var(--border)]', className)}
    >
      <img
        src={scene.media.poster}
        alt={t(`shots.${scene.key}.alt`)}
        width={MEDIA_SIZE.width}
        height={MEDIA_SIZE.height}
        loading="lazy"
        decoding="async"
        className="block size-full object-cover"
      />
      <span aria-hidden className="absolute right-2 bottom-2 grid size-7 place-items-center rounded-full bg-[rgba(11,10,9,0.72)] text-foreground backdrop-blur-sm">
        <Play className="size-3.5" strokeWidth={2.2} fill="currentColor" />
      </span>
    </button>
  )
}
