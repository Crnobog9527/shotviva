'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import { LoopPlate } from './card-media'
import { cardPrice, hasStills, isMotion, type CatalogueTemplate } from './catalogue-template'
import type { CatalogueSeries } from './catalogue-view'
import { COVER_SIZES } from './cover-sizes'
import { PairMedia } from './pair-media'

type Props = { series: CatalogueSeries | null; onClose(): void; onPick(template: CatalogueTemplate): void }

// The series sheet (T102, after Lovart's series picker): every member of the series as a split
// thumbnail with its name and price, two across; choosing one hands over to the creation dialog
// that a template card opens, so a series adds no second way to make a photo. A bottom drawer on
// phones, a dialog from md (DESIGN §8.4). Loaded only once a series is opened.
export function SeriesSheet({ series, onClose, onPick }: Props) {
  const t = useTranslations('app.series')
  // The last series stays mounted while the sheet closes, so its closing motion can play.
  const [shown, setShown] = useState(series)
  if (series && series !== shown) setShown(series)
  if (!shown) return null
  return (
    <ResponsiveSheet
      open={series !== null}
      onOpenChange={(open) => !open && onClose()}
      title={shown.name}
      description={shown.description || t('pick', { count: shown.members.length })}
    >
      <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5">
        {shown.members.map((template, index) => (
          <li key={template.id}>
            <MemberButton template={template} eager={index < 4} onPick={onPick} />
          </li>
        ))}
      </ul>
    </ResponsiveSheet>
  )
}

function MemberButton({ template, eager, onPick }: { template: CatalogueTemplate; eager: boolean; onPick(template: CatalogueTemplate): void }) {
  const t = useTranslations('app.template')
  const alt = t('cardAlt', { name: template.name })
  const cost = cardPrice(template)
  return (
    <button type="button" aria-haspopup="dialog" onClick={() => onPick(template)} className="group block w-full rounded-control text-left transition-transform duration-250 ease-house active:scale-[.97]">
      {hasStills(template) ? (
        <PairMedia before={template.cover.before as string} after={template.cover.after as string} alt={alt} eager={eager} sizes={COVER_SIZES.sheetPlate} className="transition-shadow group-hover:shadow-[inset_0_0_0_1px_var(--input)]" />
      ) : isMotion(template) ? (
        <LoopPlate template={template} alt={alt} sizes={COVER_SIZES.sheetFrame} />
      ) : (
        <span className="hairline block aspect-[8/5] rounded-control bg-muted" />
      )}
      <span className="block pt-2 text-body leading-[1.25] font-semibold tracking-[-0.015em]">{template.name}</span>
      {cost !== null ? <span className="mt-1 block font-mono text-caption leading-[1.35] text-muted-foreground">{t('fromCredits', { count: cost })}</span> : null}
    </button>
  )
}
