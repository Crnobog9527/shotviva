'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { coverImage } from '@/core/ui/cover-image'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { FavoriteButton } from '../favorites/favorite-button'
import { useFavorites } from '../favorites/favorites-provider'
import { savedIn } from '../favorites/favorites-store'
import { GroundedImg } from '../result/grounded-img'
import { thumbImage } from './thumb-image'
import { categoriesOf } from '../catalogue/catalogue-template'
import type { TemplateSample } from './home-samples'

type Props = {
  templates: readonly CatalogueTemplate[]
  selected: CatalogueTemplate
  onSelect(id: string): void
  sampleOf(template: CatalogueTemplate): TemplateSample | null
  thumbOf(template: CatalogueTemplate): string | null
}

// One plate of the sample pair: half the left column (46% of the 1040px dialog, less its 24px
// padding) from 768, half the drawer on phones (marketing.css .mk-pk-*).
const PLATE_SIZES = '(min-width: 768px) 230px, 50vw'

// The left column: the chosen template's phone → AI pair (plain images; the dialog is not the
// SEO surface) and what it is. The save heart (T83) takes the bottom-right corner: the Phone / AI
// tags sit along the top here.
export function PickerSample({ selected, sampleOf }: Pick<Props, 'selected' | 'sampleOf'>) {
  const t = useTranslations('app.template')
  const sample = sampleOf(selected)
  return (
    <div className="mk-pk-sample">
      <div className="relative">
        {sample ? (
          <span className="mk-pair mk-pair-lg mk-pair-static">
            {/* eslint-disable-next-line @next/next/no-img-element -- a cover through the optimiser (coverImage) */}
            <img className="mk-b" {...coverImage(sample.before, PLATE_SIZES)} alt="" />
            {/* White behind the result: a transparent cut-out cover reads as white. */}
            <GroundedImg className="mk-a" ground="white" {...coverImage(sample.after, PLATE_SIZES)} alt={t('cardAlt', { name: selected.name })} />
            <span className="mk-hl" aria-hidden />
            <span className="mk-tag mk-tag-l" aria-hidden>
              {t('phone')}
            </span>
            <span className="mk-tag mk-tag-r" aria-hidden>
              {t('ai')}
            </span>
          </span>
        ) : (
          <span className="mk-pk-blank" aria-hidden />
        )}
        <FavoriteButton template={selected} surface="home_picker" className="right-1 bottom-1" />
      </div>
      <p className="mk-pk-cap">{[selected.categoryName, selected.description, t('example')].filter(Boolean).join(' · ')}</p>
    </div>
  )
}

// The right column: templates grouped by category, one chosen (a radio group). Signed in with
// saved templates, a Saved group leads, newest first (T83); those templates also stay in their
// own category.
export function PickerList({ templates, selected, onSelect, thumbOf }: Omit<Props, 'sampleOf'>) {
  const savedName = useTranslations('app.favorites')('pickerGroup')
  const ids = useFavorites()?.ids
  const saved = ids ? savedIn(ids, templates) : []
  const row = (template: CatalogueTemplate) => (
    <PickerRow key={template.id} template={template} chosen={template.id === selected.id} onSelect={onSelect} thumb={thumbOf(template)} />
  )
  // Two radio groups, so a saved template listed twice is never two checked radios in one group.
  return (
    <div className="mk-pk-list">
      {saved.length > 0 ? (
        <div role="radiogroup" aria-label={savedName} className="contents">
          <PickerGroup name={savedName}>{saved.map(row)}</PickerGroup>
        </div>
      ) : null}
      <div role="radiogroup" className="contents">
        {categoriesOf(templates).map((category) => (
          <PickerGroup key={category.key} name={category.name}>
            {templates.filter((template) => template.category === category.key).map(row)}
          </PickerGroup>
        ))}
      </div>
    </div>
  )
}

function PickerGroup({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={name}>
      <p className="mk-pk-cat" aria-hidden>
        {name}
      </p>
      {children}
    </div>
  )
}

type RowProps = { template: CatalogueTemplate; chosen: boolean; onSelect(id: string): void; thumb: string | null }

function PickerRow({ template, chosen, onSelect, thumb }: RowProps) {
  const t = useTranslations('app.template')
  return (
    <button type="button" role="radio" aria-checked={chosen} className="mk-pk-row" onClick={() => onSelect(template.id)}>
      {thumb ? <GroundedImg className="mk-pk-th" ground="white" {...thumbImage(thumb, 44)} alt="" /> : <span className="mk-pk-th" aria-hidden />}
      <span className="mk-pk-t">
        <b>{template.name}</b>
        {template.description ? <small>{template.description}</small> : null}
      </span>
      <span className="mk-cost">{t('fromCredits', { count: template.creditsCost['1k'] })}</span>
    </button>
  )
}
