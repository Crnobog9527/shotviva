import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

// The mark on a Max feature (T107): Max in its gold on the gold plate the paywall's Max card
// uses, with a drawn lock while the account is below Max. The feature stays visible; pressing
// it opens the paywall on Max.
export function MaxBadge({ locked, className }: { locked: boolean; className?: string }) {
  const t = useTranslations('app.matrix')
  return (
    <span className={cn('inline-flex h-6 flex-none items-center gap-1 rounded-full bg-[var(--tier-max-plate)] px-2 text-caption leading-none font-semibold text-[var(--tier-max-gold)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--tier-max-gold)_26%,transparent)]', className)}>
      {locked ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      ) : null}
      {t('badge')}
      {locked ? <span className="sr-only">{t('locked')}</span> : null}
    </span>
  )
}
