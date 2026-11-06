'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

export type PhotoViewId = 'result' | 'checker' | 'original'

// "Result | Original", or "On white | Transparent | Original" for a cut-out (T6 photo.html,
// T32): frosted 32px pills riding the photo's bottom-right corner, 44px hit area, the
// selected one solid bone like any selected chip.
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
