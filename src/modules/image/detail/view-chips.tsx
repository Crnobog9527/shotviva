'use client'

import { useTranslations } from 'next-intl'

import type { DownloadBackground } from '@/core/storage/rules/download-background'
import { cn } from '@/core/ui/cn'

export type PhotoViewId = 'result' | 'checker' | 'original'

// "Result | Original", or "On white | Transparent | Original" for a cut-out (T6 photo.html,
// T32): frosted 32px pills riding the photo's bottom-right corner, 44px hit area, the
// selected one solid bone like any selected chip. On a cut-out 白底 / 透明 are also the download
// choice (ARCHITECTURE §8): what you see is the file you save. 原图 only shows the upload.
export function viewsFor(transparent: boolean): PhotoViewId[] {
  return transparent ? ['result', 'checker', 'original'] : ['result', 'original']
}

const LABEL_KEY = { result: 'result', checker: 'transparent', original: 'original' } as const

export function ViewChips({ views, value, transparent, onChange, className }: { views: PhotoViewId[]; value: PhotoViewId; transparent: boolean; onChange(next: PhotoViewId): void; className?: string }) {
  const t = useTranslations('app.result.views')
  return (
    <div role="group" aria-label={t('label')} className={cn('flex gap-1.5', className)}>
      {views.map((view) => (
        <button
          key={view}
          type="button"
          aria-pressed={view === value}
          onClick={() => onChange(view)}
          className={cn(
            "press relative inline-flex h-8 items-center rounded-full px-3 text-caption leading-none font-medium before:absolute before:-inset-x-0.5 before:-inset-y-1.5 before:content-['']",
            view === value ? 'bg-foreground text-background' : 'frost text-foreground',
          )}
        >
          {t(view === 'result' && transparent ? 'onWhite' : LABEL_KEY[view])}
        </button>
      ))}
    </div>
  )
}

// The chip a cut-out's download choice lights up, unless the upload is on show.
export function viewForBackground(background: DownloadBackground, original: boolean): PhotoViewId {
  if (original) return 'original'
  return background === 'transparent' ? 'checker' : 'result'
}

// The download choice a chip sets; 原图 sets none.
export function backgroundForView(view: PhotoViewId): DownloadBackground | null {
  if (view === 'original') return null
  return view === 'checker' ? 'transparent' : 'white'
}
