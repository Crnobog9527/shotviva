'use client'

import { useTranslations } from 'next-intl'

import { ActionBar } from '@/core/app-shell'
import { PaywallButton } from '@/core/billing/paywall/provider'
import type { MembershipTier } from '@/core/config'
import { buttonVariants } from '@/core/ui/button'

import { batchCounts, MATRIX_TEMPLATES } from '../gated/feature-access'
import { IntroTrigger } from '../gated/intro-trigger'
import { TierBadge } from '../gated/tier-badge'
import { MatrixHead } from './matrix-form'

// Batch create below Pro (Owner 2026-11-12): what it does, drawn as the grid it makes, what each
// plan holds with its locked mark, a way to watch the demo, and one primary that opens the
// paywall on Pro (the plan that starts batches); Max is a quiet second line. Nothing pretends
// to work.
export function MatrixLocked({ tier }: { tier: MembershipTier | null }) {
  const t = useTranslations('app.matrix')
  const counts = batchCounts()
  return (
    <section aria-labelledby="matrix-locked-h" className="px-(--gutter) lg:mx-auto lg:max-w-[560px]">
      <MatrixHead caps={null} />
      <div className="hairline-lit mt-5 rounded-panel bg-card p-5">
        <h2 id="matrix-locked-h" className="text-headline leading-[1.25] font-semibold tracking-[-0.01em]">{t('lockedTitle')}</h2>
        <ul className="mt-3 grid gap-2 text-body leading-[1.45] text-bone-dim">
          <li className="flex items-start gap-2">
            <TierBadge tier="pro" locked className="mt-px" />
            <span>{t('lockedPro', { count: counts.pro })}</span>
          </li>
          <li className="flex items-start gap-2">
            <TierBadge tier="max" locked className="mt-px" />
            <span>{t('lockedMax', { count: counts.max, templates: MATRIX_TEMPLATES })}</span>
          </li>
        </ul>
        <GridDrawing />
        <IntroTrigger tab="batch" tier={tier} className="press mt-2 inline-flex min-h-11 items-center gap-1.5 text-caption font-semibold text-foreground hover:underline hover:underline-offset-3">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-primary" fill="currentColor">
            <path d="M8 5.5v13l10.5-6.5z" />
          </svg>
          {t('lockedDemo')}
        </IntroTrigger>
      </div>
      <ActionBar className="md:px-0">
        <PaywallButton trigger="tier_required" options={{ step: 'period', tier: 'pro', moment: 'photos' }} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
          {t('lockedCta', { count: counts.pro })}
        </PaywallButton>
        <PaywallButton trigger="tier_required" options={{ step: 'period', tier: 'max', moment: 'templates' }} className="press mt-1 flex min-h-11 w-full items-center justify-center text-caption font-semibold text-foreground underline-offset-4 hover:underline">
          {t('lockedSeeMax')}
        </PaywallButton>
      </ActionBar>
    </section>
  )
}

// 3 photos × 3 templates = 9: rows are photos, columns templates, drawn in hairlines.
function GridDrawing() {
  const t = useTranslations('app.matrix')
  return (
    <figure className="mt-4">
      <svg viewBox="0 0 220 150" role="img" aria-label={t('lockedDrawing')} className="w-full max-w-[320px]">
        {[0, 1, 2].map((row) => (
          <g key={row}>
            <rect x="4" y={38 + row * 37} width="26" height="32" rx="5" fill="var(--muted)" stroke="var(--input)" />
            {[0, 1, 2].map((col) => (
              <rect key={col} x={46 + col * 58} y={38 + row * 37} width="50" height="32" rx="6" fill="var(--safelight-wash)" stroke="var(--primary)" strokeWidth="1.25" />
            ))}
          </g>
        ))}
        {[0, 1, 2].map((col) => (
          <rect key={col} x={58 + col * 58} y="4" width="26" height="26" rx="5" fill="var(--muted)" stroke="var(--input)" />
        ))}
      </svg>
      <figcaption className="mt-2 font-mono text-caption text-muted-foreground">3 × 3 = 9</figcaption>
    </figure>
  )
}
