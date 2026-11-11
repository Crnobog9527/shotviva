import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

// "Series" / 「系列」 (Owner 2026-11-12): marks a series at a glance wherever one shows, on its
// card's picture (top left, the corner the Phone / AI tags and the save heart leave free) and in
// its creation panel. A stack-of-prints glyph and the word, on the same frosted ground as the
// Phone tag so it reads as part of the picture's labelling, not as a button.
export function SeriesBadge({ className, onPhoto = true }: { className?: string; onPhoto?: boolean }) {
  const t = useTranslations('app.series')
  return (
    <span className={cn('inline-flex min-h-7 items-center gap-1.5 rounded-tag px-2.5 py-1 text-caption leading-none font-semibold',
      onPhoto ? 'frost text-photo-ink' : 'bg-wash-strong text-foreground', className)}>
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 flex-none" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
        <rect x="2" y="5.5" width="9" height="8" rx="1.5" />
        <path d="M5 3.5h7.5A1.5 1.5 0 0 1 14 5v6.5" strokeLinecap="round" />
      </svg>
      {t('badge')}
    </span>
  )
}
