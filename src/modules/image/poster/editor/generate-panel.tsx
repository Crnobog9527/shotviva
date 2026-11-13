'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { pagesReady } from '@/core/poster'

import type { Balance } from '@/core/billing/pools'
import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'

import { canAfford } from '../../workspace/cta-state'
import { ResolutionPicker, SizePicker } from '../../workspace/option-pickers'
import type { PosterStudioState, StudioTemplate } from '../use-poster-studio'
import { PageStatus } from './page-status'

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
      <ResolutionPicker options={options} aspect={studio.aspect} value={studio.resolution} costs={template.creditsCost} balance={balance} onChange={studio.setResolution} />
      {studio.draft.unverified.length > 0 ? (
        <label className="flex min-h-11 items-center gap-3 text-caption">
          <Checkbox checked={studio.draft.reviewed} onCheckedChange={(checked) => studio.setReviewed(checked === true)} />
          {t('reviewed', { count: studio.draft.unverified.length })}
        </label>
      ) : null}
      <p className="text-caption text-muted-foreground">{t('proofread')}</p>
      {studio.notice && studio.notice !== 'sortFailed' && studio.notice !== 'clipped' ? <p className="text-caption text-destructive">{t(`notice.${studio.notice}`)}</p> : null}
    </section>
  )
}

// One ordinary job per poster, so the total is the template's price at this resolution times
// the number of posters.
export function GenerateButton({ studio, template, balance }: Props) {
  const t = useTranslations('app.poster')
  const format = useFormatter()
  const total = template.creditsCost[studio.resolution] * studio.parts.length
  return (
    <Button className="min-h-12 w-full" disabled={!canStart(studio, balance, total) || studio.busy} onClick={() => void studio.generate()}>
      {studio.busy ? t('starting') : t('generate', { count: studio.parts.length, credits: format.number(total) })}
    </Button>
  )
}

// Every picked photo has finished uploading (a failed one must be picked again or removed).
const slotsReady = (studio: PosterStudioState) => studio.photos.status !== 'uploading' && !Object.values(studio.photos.byKey).some((photo) => photo.upload.phase === 'error')

// Valid text that makes every page, flagged lines confirmed, credits enough for all.
function canStart(studio: PosterStudioState, balance: Balance, total: number) {
  const mustReview = studio.draft.unverified.length > 0 && !studio.draft.reviewed
  return studio.valid && pagesReady(studio.parts) && slotsReady(studio) && !mustReview && canAfford(balance, total)
}

