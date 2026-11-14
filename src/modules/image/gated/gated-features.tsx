'use client'

import { useTranslations } from 'next-intl'

import type { MembershipTier } from '@/core/config'

import { preloadBatchDialog } from '../matrix/batch-dialog-slot'
import { openBatch } from '../matrix/batch-query'
import { batchCaps, batchCounts, isLocked, MATRIX_TEMPLATES } from './feature-access'
import { GuideButton } from './guide-button'
import { IntroTrigger } from './intro-trigger'
import { TierBadge } from './tier-badge'

// Kept for the Create page's catalogue wrapper (scroll target of in-page links).
export const TEMPLATES_ANCHOR = 'templates'

// The card's whole face is its button (an ::after over the card), with "See how it works" above
// it as a button of its own.
const ENTRY = "text-left after:absolute after:inset-0 after:rounded-tile after:content-[''] focus-visible:outline-none focus-visible:after:shadow-[inset_0_0_0_2px_var(--ring)]"

// Create's one way into Batch create (Owner 2026-11-12): batch photos and several templates in
// one creation screen, which opens as a dialog right here (never another page). The card names
// both plans with what each brings, lit or locked for this account. With Pro or Max it opens the
// dialog; below Pro it opens the intro first, then the paywall on Pro. "See how it works" is a
// labelled button on the card, for everyone, and only plays the demo.
export function GatedFeatures({ tier }: { tier: MembershipTier | null }) {
  const t = useTranslations('app.gated')
  return (
    <section aria-label={t('heading')} className="pt-2">
      <div className="press hairline relative flex w-full items-start gap-3 rounded-tile bg-card p-3 md:items-center md:p-3.5">
        <CardIcon />
        <div className="min-w-0 flex-1 md:flex md:items-center md:gap-4">
          <div className="min-w-0 md:flex-1">
            <Entry tier={tier} />
            <span className="mt-1 block text-caption leading-[1.35] text-pretty text-muted-foreground">{t('create.line')}</span>
          </div>
          <PlanMarks tier={tier} />
          <GuideButton tier={tier} className="relative z-10 mt-3 md:mt-0" />
        </div>
      </div>
    </section>
  )
}

function Entry({ tier }: { tier: MembershipTier | null }) {
  const t = useTranslations('app.gated.create')
  const title = <b className="block text-body leading-[1.25] font-semibold">{t('title')}</b>
  if (batchCaps(tier)) {
    return (
      <button type="button" data-batch-entry onClick={() => openBatch()} onPointerEnter={preloadBatchDialog} onFocus={preloadBatchDialog} className={ENTRY}>
        {title}
      </button>
    )
  }
  return (
    <IntroTrigger tab="batch" tier={tier} upgrade="pro" className={ENTRY}>
      {title}
    </IntroTrigger>
  )
}

// "Pro · 10 photos" and "Max · 30 photos · 5 templates", each locked while the account is below it.
function PlanMarks({ tier }: { tier: MembershipTier | null }) {
  const t = useTranslations('app.gated.create')
  const counts = batchCounts()
  return (
    <span className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5 md:mt-0 md:flex-none">
      <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
        <TierBadge tier="pro" locked={isLocked('batch', tier)} />
        {t('pro', { count: counts.pro })}
      </span>
      <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
        <TierBadge tier="max" locked={isLocked('templates', tier)} />
        {t('max', { count: counts.max, templates: MATRIX_TEMPLATES })}
      </span>
    </span>
  )
}

// Drawn in the house stroke: photos down, templates across, the grid a batch makes.
function CardIcon() {
  return (
    <span aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-[11px] bg-wash text-primary md:size-10 md:rounded-[12px]">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round">
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </svg>
    </span>
  )
}
