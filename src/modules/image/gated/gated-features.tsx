'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { MembershipTier } from '@/core/config'
import { Link } from '@/core/i18n/ui'

import { BATCH_WORKSPACE, batchCaps, batchCounts, isLocked, MATRIX_TEMPLATES } from './feature-access'
import { GuideIcon } from './guide-button'
import { IntroTrigger } from './intro-trigger'
import { TierBadge } from './tier-badge'

const CARD = 'press hairline flex w-full items-start gap-3 rounded-tile bg-card p-3 pr-14 text-left md:items-center md:p-3.5 md:pr-16'

// Kept for the Create page's catalogue wrapper (scroll target of in-page links).
export const TEMPLATES_ANCHOR = 'templates'

// Create's one way into Batch create (Owner 2026-11-12: batch photos and several templates are
// one creation screen, not two cards). The card names both plans with what each brings, lit or
// locked for this account. With Pro or Max it opens the page; below Pro it opens the guide as an
// intro first, then the paywall on Pro. The "?" in its corner is the tutorial, for everyone.
export function GatedFeatures({ tier }: { tier: MembershipTier | null }) {
  const t = useTranslations('app.gated')
  const open = batchCaps(tier) !== null
  return (
    <section aria-label={t('heading')} className="relative pt-2">
      <Entry open={open} tier={tier}>
        <CardIcon />
        <span className="min-w-0 flex-1 md:flex md:items-center md:gap-4">
          <span className="block min-w-0 md:flex-1">
            <b className="block text-body leading-[1.25] font-semibold">{t('create.title')}</b>
            <span className="mt-1 block text-caption leading-[1.35] text-pretty text-muted-foreground">{t('create.line')}</span>
          </span>
          <PlanMarks tier={tier} />
        </span>
      </Entry>
      <IntroTrigger
        tab="batch"
        tier={tier}
        label={t('guide.open')}
        className="press absolute top-2 right-0 grid size-12 place-items-center rounded-full text-bone-dim hover:text-foreground md:top-[calc(50%+4px)] md:right-1.5 md:-translate-y-1/2"
      >
        <GuideIcon />
      </IntroTrigger>
    </section>
  )
}

function Entry({ open, tier, children }: { open: boolean; tier: MembershipTier | null; children: ReactNode }) {
  if (open) {
    return (
      <Link href={BATCH_WORKSPACE} className={CARD}>
        {children}
      </Link>
    )
  }
  return (
    <IntroTrigger tab="batch" tier={tier} upgrade="pro" className={CARD}>
      {children}
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
