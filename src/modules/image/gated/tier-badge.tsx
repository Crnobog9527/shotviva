import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

import type { PaidTier } from './feature-access'

// The tier's plate and ink from the paywall materials (DESIGN "The Tier Materials Rule"):
// Pro sapphire glass, Max black and gold. The paywall is the only place these hues are a
// surface; here they are a small mark, so a member can tell which plan a feature comes with.
const MATERIAL: Record<PaidTier, string> = {
  pro: 'bg-[var(--tier-sapphire-plate)] text-[var(--tier-sapphire-ink)] shadow-[inset_0_0_0_1px_var(--tier-sapphire-edge)]',
  max: 'bg-[var(--tier-max-plate)] text-[var(--tier-max-gold)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--tier-max-gold)_26%,transparent)]',
}

// The mark on a tier-gated feature: the plan's name on its plate, with a drawn lock while the
// account is below it. The feature stays visible either way.
export function TierBadge({ tier, locked, className }: { tier: PaidTier; locked: boolean; className?: string }) {
  const t = useTranslations('app.gated')
  return (
    <span className={cn('inline-flex h-6 flex-none items-center gap-1 rounded-full px-2 text-caption leading-none font-semibold', MATERIAL[tier], className)}>
      {locked ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      ) : null}
      {t(`badge.${tier}`)}
      {locked ? <span className="sr-only">{t('lockedSr', { tier: t(`badge.${tier}`) })}</span> : null}
    </span>
  )
}
