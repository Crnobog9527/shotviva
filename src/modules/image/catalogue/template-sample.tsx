'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/core/ui/cn'

import { LoopPlate } from './card-media'
import { hasStills, isArtStyle, isMotion, type CatalogueTemplate } from './catalogue-template'
import { CompareSlider } from './compare-slider'
import { PairMedia } from './pair-media'

// The template's example in the creation dialog and on the workspace stage (B comp app.css
// .cd-media / .dev): the side-by-side pair, the drag compare for Art Styles, or the loop when a
// motion template has no stills. `fill` stretches it over a frame the caller sizes.
export function TemplateSample({ template, fill = false, className }: { template: CatalogueTemplate; fill?: boolean; className?: string }) {
  const t = useTranslations('app.template')
  const { before, after } = template.cover
  const frame = cn(fill && 'absolute inset-0 aspect-auto size-full rounded-none shadow-none', className)
  if (before && after && isArtStyle(template)) {
    return <CompareSlider before={before} after={after} afterAlt={t('resultAlt', { name: template.name })} className={frame} />
  }
  if (hasStills(template)) return <PairMedia before={before as string} after={after as string} alt={t('cardAlt', { name: template.name })} eager size="pair" className={frame} />
  if (isMotion(template)) return <LoopPlate template={template} alt={t('loopAria', { name: template.name })} className={frame} />
  return <span className={cn('block aspect-[8/5] rounded-media bg-muted', frame)} />
}

// Whether the sample is the tall drag compare (the dialog sizes its strip by it).
export const isCompareSample = (template: CatalogueTemplate) => isArtStyle(template) && hasStills(template)
