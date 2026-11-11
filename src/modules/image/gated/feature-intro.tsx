'use client'

import { useTranslations } from 'next-intl'

import { usePaywall } from '@/core/billing/paywall/provider'
import type { MembershipTier } from '@/core/config'
import { buttonVariants } from '@/core/ui/button'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import { batchCounts, featureAccess, MATRIX_TEMPLATES, type FeatureAccess, type GatedFeature, type PaidTier } from './feature-access'
import { BatchPlayer, TemplatesPlayer } from './intro-players'

type Props = {
  feature: GatedFeature
  tier: MembershipTier | null
  open: boolean
  onOpenChange(open: boolean): void
  onStart?: () => void
}

// The paywall opens once this sheet has slid away, so the two never fight over focus.
const HANDOFF_MS = 320

// What a tier-gated feature does, shown before any price (Owner 2026-11-12): a short demo built
// from real example outputs, the steps in plain words, then one clear way to upgrade. The
// paywall it opens keeps its own one-line lead (T107 moments); the explaining lives here.
export function FeatureIntro({ feature, tier, open, onOpenChange, onStart }: Props) {
  const t = useTranslations('app.gated')
  const access = featureAccess(feature, tier)
  const counts = batchCounts()
  const lede = access.kind === 'guide' ? t('batch.ledeGuide', { count: counts.pro }) : t(`${feature}.lede`, counts)
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t(`${feature}.title`)}
      description={lede}
      footer={<IntroActions feature={feature} access={access} onClose={() => onOpenChange(false)} onStart={onStart} />}
    >
      {feature === 'batch' ? <BatchPlayer /> : <TemplatesPlayer />}
      {feature === 'templates' ? <TemplateSteps /> : null}
      <p className="mt-4 text-caption leading-[1.45] text-muted-foreground">{t(`${feature}.note`)}</p>
    </ResponsiveSheet>
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

type ActionProps = { feature: GatedFeature; access: FeatureAccess; onClose(): void; onStart?: () => void }

// One primary: upgrade to the plan the feature needs (a Pro member's guide: go pick a template).
// Batch also offers Max, the 30-photo plan, as a quiet second line.
function IntroActions({ feature, access, onClose, onStart }: ActionProps) {
  const t = useTranslations('app.gated')
  const paywall = usePaywall()
  const counts = batchCounts()
  const upgrade = (tier: PaidTier) => {
    onClose()
    window.setTimeout(() => paywall.open('tier_required', { step: 'period', tier, moment: feature === 'batch' ? 'photos' : 'templates' }), HANDOFF_MS)
  }
  const start = () => {
    onClose()
    window.setTimeout(() => onStart?.(), HANDOFF_MS)
  }
  const more = feature === 'batch' && (access.kind === 'locked' || (access.kind === 'guide' && access.more))
  return (
    <div className="flex-none border-t border-border px-4 pt-3 pb-[calc(var(--sab)+12px)] md:px-6 md:pt-4 md:pb-6">
      {access.kind === 'guide' ? (
        <button type="button" onClick={start} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
          {t('batch.start')}
        </button>
      ) : access.kind === 'locked' ? (
        <button type="button" onClick={() => upgrade(access.needs)} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
          {t(`${feature}.cta`, counts)}
        </button>
      ) : null}
      {more ? (
        <button type="button" onClick={() => upgrade('max')} className="press mt-1 flex min-h-11 w-full items-center justify-center text-caption font-semibold text-foreground underline-offset-4 hover:underline">
          {t('batch.seeMax', counts)}
        </button>
      ) : null}
    </div>
  )
}
