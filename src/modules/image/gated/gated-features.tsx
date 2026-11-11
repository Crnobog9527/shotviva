'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { MembershipTier } from '@/core/config'
import { Link } from '@/core/i18n/ui'

import { batchCounts, FEATURE_TIER, featureAccess, GATED_FEATURES, MATRIX_TEMPLATES, type GatedFeature } from './feature-access'
import { IntroTrigger } from './intro-trigger'
import { TierBadge } from './tier-badge'

const TILE = 'press hairline flex h-full min-h-[104px] w-full flex-col rounded-tile bg-card p-3 text-left md:min-h-0 md:flex-row md:items-center md:gap-3 md:p-3.5'

// Where the templates start on the Create page: a Pro member's batch guide sends them there.
export const TEMPLATES_ANCHOR = 'templates'

// Create's tier-gated ways to create (Owner 2026-11-12), side by side above the catalogue: each
// with the plan it comes with, locked below that plan. Members who have it go straight in.
export function GatedFeatures({ tier }: { tier: MembershipTier | null }) {
  const t = useTranslations('app.gated')
  const counts = batchCounts()
  return (
    <section aria-label={t('heading')} className="pt-2">
      <ul className="grid grid-cols-2 gap-2 md:gap-3">
        {GATED_FEATURES.map((feature) => (
          <li key={feature}>
            <FeatureTile feature={feature} tier={tier}>
              <TileBody
                feature={feature}
                locked={featureAccess(feature, tier).kind === 'locked'}
                title={t(`${feature}.title`)}
                line={feature === 'batch' ? t('batch.line', counts) : t('templates.line', { templates: MATRIX_TEMPLATES })}
              />
            </FeatureTile>
          </li>
        ))}
      </ul>
    </section>
  )
}

function FeatureTile({ feature, tier, children }: { feature: GatedFeature; tier: MembershipTier | null; children: ReactNode }) {
  const access = featureAccess(feature, tier)
  if (access.kind === 'open') {
    return (
      <Link href={access.href} className={TILE}>
        {children}
      </Link>
    )
  }
  return (
    <IntroTrigger feature={feature} tier={tier} className={TILE} onStart={scrollToTemplates}>
      {children}
    </IntroTrigger>
  )
}

function scrollToTemplates() {
  document.getElementById(TEMPLATES_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function TileBody({ feature, locked, title, line }: { feature: GatedFeature; locked: boolean; title: string; line: string }) {
  return (
    <>
      <span className="flex items-start justify-between gap-2 md:contents">
        <FeatureIcon feature={feature} />
        <TierBadge tier={FEATURE_TIER[feature]} locked={locked} className="md:order-last" />
      </span>
      <span className="mt-2.5 block min-w-0 md:mt-0 md:flex-1">
        <b className="block text-body leading-[1.25] font-semibold">{title}</b>
        <span className="mt-1 block text-caption leading-[1.35] text-balance text-muted-foreground">{line}</span>
      </span>
    </>
  )
}

// Drawn in the house stroke: a stack of photos (batch), a 2×2 grid (templates × photos).
function FeatureIcon({ feature }: { feature: GatedFeature }) {
  return (
    <span aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-[11px] bg-wash text-primary md:size-10 md:rounded-[12px]">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round">
        {feature === 'batch' ? (
          <>
            <rect x="7" y="7" width="13" height="13" rx="2" />
            <path d="M4 16V6a2 2 0 0 1 2-2h10" />
            <path d="M10.5 15.5l2-2.5 2 2 1.5-1.5 1.5 2" />
          </>
        ) : (
          <>
            <rect x="4" y="4" width="7" height="7" rx="1.5" />
            <rect x="13" y="4" width="7" height="7" rx="1.5" />
            <rect x="4" y="13" width="7" height="7" rx="1.5" />
            <rect x="13" y="13" width="7" height="7" rx="1.5" />
          </>
        )}
      </svg>
    </span>
  )
}
