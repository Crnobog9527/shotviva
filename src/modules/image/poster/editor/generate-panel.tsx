'use client'

import { useFormatter, useLocale, useTranslations } from 'next-intl'

import type { Balance } from '@/core/billing/pools'
import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'

import { canAfford } from '../../workspace/cta-state'
import { ResolutionPicker, SizePicker } from '../../workspace/option-pickers'
import type { PosterStudioState, StudioTemplate } from '../use-poster-studio'

type Props = { studio: PosterStudioState; template: StudioTemplate; balance: Balance }

// What will be made and what it costs (ARCHITECTURE §5.3 拆张): one ordinary job per poster, so
// the total is the template's price at this resolution times the number of posters.
export function GeneratePanel({ studio, template, balance }: Props) {
  const t = useTranslations('app.poster')
  const format = useFormatter()
  const locale = useLocale()
  const options = { resolutions: template.resolutions, aspectRatios: template.aspects, originalRatio: false }
  const total = template.creditsCost[studio.resolution] * studio.parts.length
  const oversized = studio.parts.some((part) => part.oversized)
  const ready = canStart(studio, balance, total)
  return (
    <section className="grid gap-4 rounded-card bg-card p-4 hairline">
      <h2 className="text-body font-semibold">{t('split.count', { count: studio.parts.length })}</h2>
      <ul className="grid gap-1 text-caption text-muted-foreground">
        {studio.parts.map((part, i) => (
          <li key={i}>{t('split.part', { name: kindName(template, part.kind, locale), page: part.page, pages: part.pages })}</li>
        ))}
      </ul>
      {oversized ? <p className="text-caption text-destructive">{t('split.oversized')}</p> : null}
      <h3 id="size-h" className="text-caption font-medium">{t('size')}</h3>
      <SizePicker options={options} value={studio.aspect} onChange={studio.setAspect} />
      <h3 id="res-h" className="text-caption font-medium">{t('resolution')}</h3>
      <ResolutionPicker options={options} value={studio.resolution} costs={template.creditsCost} balance={balance} onChange={studio.setResolution} />
      {studio.draft.unverified.length > 0 ? (
        <label className="flex min-h-11 items-center gap-3 text-caption">
          <Checkbox checked={studio.draft.reviewed} onCheckedChange={(checked) => studio.setReviewed(checked === true)} />
          {t('reviewed', { count: studio.draft.unverified.length })}
        </label>
      ) : null}
      <p className="text-caption text-muted-foreground">{t('proofread')}</p>
      {studio.notice && studio.notice !== 'sortFailed' ? <p className="text-caption text-destructive">{t(`notice.${studio.notice}`)}</p> : null}
      <Button className="min-h-12" disabled={!ready || studio.busy} onClick={() => void studio.generate()}>
        {studio.busy ? t('starting') : t('generate', { count: studio.parts.length, credits: format.number(total) })}
      </Button>
    </section>
  )
}

// Valid text that makes at least one poster, flagged lines confirmed, credits enough for all.
function canStart(studio: PosterStudioState, balance: Balance, total: number) {
  const mustReview = studio.draft.unverified.length > 0 && !studio.draft.reviewed
  return studio.valid && studio.parts.length > 0 && !mustReview && canAfford(balance, total)
}

const kindName = (template: StudioTemplate, key: string, locale: string) => {
  const name = template.poster.kinds.find((kind) => kind.key === key)?.name
  return name ? (locale === 'zh' ? name.zh : name.en) : key
}
