'use client'

/* eslint-disable @next/next/no-img-element -- small static example images from /public/intros */
import { useLocale, useTranslations } from 'next-intl'
import { useState, type KeyboardEvent } from 'react'

import { usePaywall } from '@/core/billing/paywall/provider'
import type { MembershipTier } from '@/core/config'
import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import { batchCaps, batchCounts, FEATURE_TIER, GATED_FEATURES, isLocked, MATRIX_TEMPLATES, type GatedFeature, type PaidTier } from './feature-access'
import { sampleResults } from './intro-media'
import { BatchPlayer, TemplatesPlayer } from './intro-players'

type Props = {
  tab: GatedFeature
  tier: MembershipTier | null
  upgrade?: PaidTier
  open: boolean
  onOpenChange(open: boolean): void
}

// The paywall opens once this sheet has slid away, so the two never fight over focus.
const HANDOFF_MS = 320

// Batch create's guide (Owner 2026-11-12), one sheet in two roles:
// - the intro a locked control opens (`upgrade` set): what the feature does, shown before any
//   price, then one button to the paywall on the plan it needs (T107 moments);
// - the tutorial anyone opens from the "?" beside Batch create, at any time: the same demos and
//   example results, closed with "Got it".
// Two tabs, one per way to use it; both reuse the #516 demos built from real example outputs.
export function FeatureGuide({ tab: initial, tier, upgrade, open, onOpenChange }: Props) {
  const t = useTranslations('app.gated')
  const [tab, setTab] = useState(initial)
  const intro = upgrade !== undefined
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={intro ? t(`${tab}.title`) : t('guide.title')}
      description={intro ? t(`${tab}.lede`, batchCounts()) : t('guide.lede')}
      footer={<GuideActions tab={tab} tier={tier} upgrade={upgrade} onClose={() => onOpenChange(false)} />}
    >
      <Tabs tab={tab} onChange={setTab} />
      <div role="tabpanel" id={`guide-${tab}`} aria-labelledby={`guide-tab-${tab}`}>
        {tab === 'batch' ? <BatchPlayer /> : <TemplatesPlayer />}
        {tab === 'templates' ? <TemplateSteps /> : null}
        <Samples tab={tab} />
        <p className="mt-4 text-caption leading-[1.45] text-muted-foreground">{t(`${tab}.note`)}</p>
      </div>
    </ResponsiveSheet>
  )
}

// Tabs the ARIA way: the selected one is in the tab order and names the one panel on screen;
// Left / Right (and Home / End) move to the other tab and show it.
function Tabs({ tab, onChange }: { tab: GatedFeature; onChange(tab: GatedFeature): void }) {
  const t = useTranslations('app.gated.guide')
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = GATED_FEATURES.indexOf(tab)
    const last = GATED_FEATURES.length - 1
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key]
    if (next === undefined) return
    event.preventDefault()
    const option = GATED_FEATURES[next]!
    onChange(option)
    document.getElementById(`guide-tab-${option}`)?.focus()
  }
  return (
    <div role="tablist" aria-label={t('tabsLabel')} onKeyDown={move} className="hairline mt-1 grid grid-cols-2 gap-1 rounded-tile p-1">
      {GATED_FEATURES.map((option) => (
        <button
          key={option}
          id={`guide-tab-${option}`}
          type="button"
          role="tab"
          aria-selected={tab === option}
          aria-controls={tab === option ? `guide-${option}` : undefined}
          tabIndex={tab === option ? 0 : -1}
          onClick={() => onChange(option)}
          className={cn('press min-h-11 rounded-[10px] px-2 text-caption leading-[1.2] font-semibold', tab === option ? 'bg-wash-strong text-foreground' : 'text-bone-dim')}
        >
          {t(`tabs.${option}`)}
        </button>
      ))}
    </div>
  )
}

function TemplateSteps() {
  const t = useTranslations('app.gated.templates')
  return (
    <ol className="mt-4 grid gap-2.5">
      {(['step1', 'step2', 'step3', 'step4'] as const).map((step) => (
        <li key={step} className="flex gap-2.5 text-body leading-[1.45] text-bone-dim">
          <span aria-hidden="true" className="mt-[0.55em] size-1.5 flex-none rounded-full bg-[var(--input)]" />
          <span>{t(step, { templates: MATRIX_TEMPLATES })}</span>
        </li>
      ))}
    </ol>
  )
}

// A row of finished example results for the tab, labelled as examples.
function Samples({ tab }: { tab: GatedFeature }) {
  const t = useTranslations('app.gated.guide')
  const samples = sampleResults(tab, useLocale())
  return (
    <section aria-label={t('samples')} className="mt-5">
      <h3 className="flex items-baseline justify-between gap-3 text-caption font-semibold text-foreground">
        {t('samples')}
        <span className="font-normal text-muted-foreground">{t('samplesNote')}</span>
      </h3>
      <ul className="mt-2 grid grid-cols-5 gap-1.5">
        {samples.map((src) => (
          <li key={src} className="relative aspect-[4/5] overflow-hidden rounded-[8px] bg-muted">
            <img src={src} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[8px] shadow-[inset_0_0_0_1px_var(--border)]" />
          </li>
        ))}
      </ul>
    </section>
  )
}

// The plan an intro's button opens on, for the tab it is on: the plan that unlocks the tab, or
// Max when the intro was opened for more of something this plan already has (Pro's photo limit).
export function introTarget(tab: GatedFeature, tier: MembershipTier | null, upgrade: PaidTier): PaidTier | null {
  if (isLocked(tab, tier)) return FEATURE_TIER[tab]
  return upgrade === 'max' && tier !== 'max' ? 'max' : null
}

type ActionProps = { tab: GatedFeature; tier: MembershipTier | null; upgrade?: PaidTier; onClose(): void }

// An intro: one primary to the plan it needs (batch below Pro also offers Max, the 30-photo
// plan, as a quiet second line). The tutorial: "Got it", and below Pro a quiet way to Pro.
function GuideActions({ tab, tier, upgrade, onClose }: ActionProps) {
  const t = useTranslations('app.gated')
  const paywall = usePaywall()
  const counts = { ...batchCounts(), templates: MATRIX_TEMPLATES }
  const open = (plan: PaidTier) => {
    onClose()
    window.setTimeout(() => paywall.open('tier_required', { step: 'period', tier: plan, moment: tab === 'batch' ? 'photos' : 'templates' }), HANDOFF_MS)
  }
  const target = upgrade ? introTarget(tab, tier, upgrade) : null
  const quiet = upgrade ? (target === 'pro' ? 'max' : null) : batchCaps(tier) === null ? 'pro' : null
  return (
    <div className="flex-none border-t border-border px-4 pt-3 pb-[calc(var(--sab)+12px)] md:px-6 md:pt-4 md:pb-6">
      {target ? (
        <button type="button" onClick={() => open(target)} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
          {t(`guide.cta.${target}`, counts)}
        </button>
      ) : (
        <button type="button" onClick={onClose} className={buttonVariants({ variant: 'cta-neutral', size: 'cta' })}>
          {t('guide.done')}
        </button>
      )}
      {quiet ? (
        <button type="button" onClick={() => open(quiet)} className="press mt-1 flex min-h-11 w-full items-center justify-center text-caption font-semibold text-foreground underline-offset-4 hover:underline">
          {t(`guide.quiet.${quiet}`, counts)}
        </button>
      ) : null}
    </div>
  )
}
