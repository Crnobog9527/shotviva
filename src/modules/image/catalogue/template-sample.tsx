'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

import { LoopPlate } from './card-media'
import { hasStills, isCompareCategory, isMotion, type CatalogueTemplate } from './catalogue-template'
import { CompareSlider } from './compare-slider'
import { COVER_SIZES } from './cover-sizes'
import { PairMedia } from './pair-media'

// The template's example in the creation dialog and on the workspace stage (B comp app.css
// .cd-media / .dev): the side-by-side pair, the drag compare for a 'compare' category (画风), or the loop when a
// motion template has no stills. `fill` stretches it over the workspace stage, which is only drawn
// from lg up: its covers load lazily, so a phone (where it is display:none) never fetches them.
export function TemplateSample({ template, fill = false, className }: { template: CatalogueTemplate; fill?: boolean; className?: string }) {
  const t = useTranslations('app.template')
  const { before, after } = template.cover
  const sizes = fill ? { plate: COVER_SIZES.stagePlate, frame: COVER_SIZES.stageFrame } : { plate: COVER_SIZES.dialogPlate, frame: COVER_SIZES.dialogFrame }
  const frame = cn(fill && 'absolute inset-0 aspect-auto size-full rounded-none shadow-none', className)
  if (before && after && isCompareCategory(template)) {
    return <CompareSlider before={before} after={after} afterAlt={t('resultAlt', { name: template.name })} cover={{ sizes: sizes.frame, lazy: fill }} className={frame} />
  }
  if (hasStills(template)) return <PairMedia before={before as string} after={after as string} alt={t('cardAlt', { name: template.name })} eager={!fill} sizes={sizes.plate} size="pair" className={frame} />
  if (isMotion(template)) return <LoopPlate template={template} alt={t('loopAria', { name: template.name })} sizes={sizes.frame} className={frame} />
  return <span className={cn('block aspect-[8/5] rounded-media bg-muted', frame)} />
}

// Whether the sample is the tall drag compare (the dialog sizes its strip by it).
export const isCompareSample = (template: CatalogueTemplate) => isCompareCategory(template) && hasStills(template)
