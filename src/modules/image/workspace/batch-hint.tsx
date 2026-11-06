'use client'

import { useTranslations } from 'next-intl'

import { batchUpgrade, limitsFor } from '@/core/billing/tier-limits'
import { PaywallButton } from '@/core/billing/paywall'
import type { MembershipTier } from '@/core/config'

// Said when a pick did not fit (T28): Starter and no tier keep the first photo, Pro the first
// 10. Where a bigger batch exists, one quiet link opens the paywall on that tier
// (paywall_view trigger tier_required).
export function BatchHint({ tier, dropped }: { tier: MembershipTier | null; dropped: number }) {
  const t = useTranslations('app.workspace')
  const tiers = useTranslations('paywall.tiers')
  if (dropped === 0) return null
  const { batchMax } = limitsFor(tier)
  const next = batchUpgrade(tier)
  const message = batchMax <= 1 && next ? t('batchOnTier', { tier: tiers(next), count: limitsFor(next).batchMax }) : t('batchKept', { max: batchMax })
  return (
    <p role="status" className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-caption text-bone-dim">
      <span>{message}</span>
      {next ? (
        <PaywallButton
          trigger="tier_required"
          options={{ step: 'period', tier: next }}
          className="press -my-2 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t('seeTier', { tier: tiers(next), count: limitsFor(next).batchMax })}
        </PaywallButton>
      ) : null}
    </p>
  )
}
