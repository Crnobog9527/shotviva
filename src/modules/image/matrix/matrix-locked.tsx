'use client'

import { useTranslations } from 'next-intl'

import { ActionBar } from '@/core/app-shell'
import { PaywallButton } from '@/core/billing/paywall/provider'
import { limitsFor } from '@/core/billing/tier-limits'
import { buttonVariants } from '@/core/ui/button'

import { MatrixHead } from './matrix-form'
import { MaxBadge } from './max-badge'
import { MATRIX_MAX_TEMPLATES } from './matrix-state'

// The multi-template batch below Max (T107): what it does, drawn as the grid it makes, the Max
// badge locked, and one primary that opens the paywall on Max. Nothing pretends to work.
export function MatrixLocked() {
  const t = useTranslations('app.matrix')
  return (
    <section aria-labelledby="matrix-locked-h" className="px-(--gutter) lg:mx-auto lg:max-w-[560px]">
      <MatrixHead />
      <div className="hairline-lit mt-5 rounded-panel bg-card p-5">
        <MaxBadge locked />
        <h2 id="matrix-locked-h" className="mt-3 text-headline leading-[1.25] font-semibold tracking-[-0.01em]">{t('lockedTitle')}</h2>
        <p className="mt-2 text-body leading-[1.5] text-bone-dim">{t('lockedLine', { templates: MATRIX_MAX_TEMPLATES, cells: limitsFor('max').batchMax })}</p>
        <GridDrawing />
        <p className="mt-3 text-caption leading-[1.4] text-muted-foreground">{t('lockedPro', { count: limitsFor('pro').batchMax })}</p>
      </div>
      <ActionBar className="md:px-0">
        <PaywallButton trigger="tier_required" options={{ step: 'period', tier: 'max', moment: 'templates' }} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
          {t('lockedCta')}
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
