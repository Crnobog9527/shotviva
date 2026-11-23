'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { pagesReady } from '@/core/poster'

import { tierPool, type Balance } from '@/core/billing/pools'
import { setCredits } from '@/core/templates/set-price'
import { Button } from '@/core/ui/button'

import { canAfford } from '../../workspace/cta-state'
import { ResolutionPicker, SizePicker } from '../../workspace/option-pickers'
import type { PosterStudioState, StudioTemplate } from '../use-poster-studio'
import { PageStatus } from './page-status'
import { ReviewCheck } from './review-check'

type Props = { studio: PosterStudioState; template: StudioTemplate; balance: Balance }

// What will be made and in which size (ARCHITECTURE §5.3 拆张); the price and the button sit in
// the dialog's pinned bar (GenerateBar).
export function GeneratePanel({ studio, template, balance }: Props) {
  const t = useTranslations('app.poster')
  const options = { resolutions: template.resolutions, aspectRatios: template.aspects, originalRatio: false }
  return (
    <section className="grid gap-4 rounded-card bg-card p-4 hairline">
      <h2 className="text-body font-semibold">{t('split.count', { count: studio.parts.length })}</h2>
      <PageStatus parts={studio.parts} template={template} />
      <h3 id="size-h" className="text-caption font-medium">{t('size')}</h3>
      <SizePicker options={options} value={studio.aspect} onChange={studio.setAspect} />
      <h3 id="res-h" className="text-caption font-medium">{t('resolution')}</h3>
      <ResolutionPicker options={options} aspect={studio.aspect} value={studio.resolution} costs={template.creditsCost} images={studio.parts.length} balance={balance} onChange={studio.setResolution} />
      {studio.draft.unverified.length > 0 ? <ReviewCheck studio={studio} /> : null}
      <p className="text-caption text-muted-foreground">{t('proofread')}</p>
      {studio.notice && studio.notice !== 'sortFailed' && studio.notice !== 'clipped' ? <p className="text-caption text-destructive">{t(`notice.${studio.notice}`)}</p> : null}
    </section>
  )
}

// One ordinary job per poster, so the total is the template's price at this resolution times
// the number of posters: the same set total the resolution cards show.
export function GenerateButton({ studio, template, balance }: Props) {
  const t = useTranslations('app.poster')
  const format = useFormatter()
  const total = setCredits(template.creditsCost[studio.resolution], studio.parts.length)
  return (
    <Button className="min-h-12 w-full" disabled={!canStart(studio, balance, total) || studio.busy} onClick={() => void studio.generate()}>
      {studio.busy ? t('starting') : t('generate', { count: studio.parts.length, credits: format.number(total) })}
    </Button>
  )
}

// Every picked photo has finished uploading (a failed one must be picked again or removed).
// A QR code is read in the browser first (use-qr-check.ts); one that cannot be read stops Generate.
const slotsReady = (studio: PosterStudioState) => studio.photos.status !== 'uploading' && !Object.values(studio.photos.byKey).some((photo) => photo.upload.phase === 'error')
  && studio.qrCheck !== 'checking' && studio.qrCheck !== 'unreadable'

// Valid text that makes every page, flagged lines confirmed, credits enough for all.
function canStart(studio: PosterStudioState, balance: Balance, total: number, reviewed = studio.draft.reviewed) {
  const mustReview = studio.draft.unverified.length > 0 && !reviewed
  return studio.valid && pagesReady(studio.parts) && slotsReady(studio) && !mustReview && canAfford(balance, total, studio.resolution)
}

// 生成 is off for one reason only, the unticked 我已核对 box: the bar says so, with 去核对.
export function waitsOnReview(studio: PosterStudioState, balance: Balance, template: StudioTemplate) {
  const total = setCredits(template.creditsCost[studio.resolution], studio.parts.length)
  return !studio.busy && !canStart(studio, balance, total) && canStart(studio, balance, total, true)
}


// Why 生成 is off when the tier's own pool cannot pay for the set (1996): 1K is free credits
// only, 2K / 4K paid credits only; the other pool is never used instead.
export function TierShortNote({ studio, template, balance }: Props) {
  const t = useTranslations('app.tiers')
  const total = setCredits(template.creditsCost[studio.resolution], studio.parts.length)
  if (canAfford(balance, total, studio.resolution)) return null
  return <p role="status" className="text-caption text-primary">{t(tierPool(studio.resolution) === 'free' ? 'freeOnly' : 'paidShort')}</p>
}
