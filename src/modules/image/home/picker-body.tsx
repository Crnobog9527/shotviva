'use client'

import { useTranslations } from 'next-intl'

import { coverImage } from '@/core/ui/cover-image'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { GroundedImg } from '../result/grounded-img'
import { thumbImage } from './thumb-image'
import { categoriesOf } from '../catalogue/catalogue-template'
import { useCategoryLabel } from '../catalogue/category-label'
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
// SEO surface) and what it is.
export function PickerSample({ selected, sampleOf }: Pick<Props, 'selected' | 'sampleOf'>) {
  const t = useTranslations('app.template')
  const label = useCategoryLabel()
  const sample = sampleOf(selected)
  return (
    <div className="mk-pk-sample">
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
      <p className="mk-pk-cap">{[label(selected.category), selected.description, t('example')].filter(Boolean).join(' · ')}</p>
    </div>
  )
}

// The right column: templates grouped by category, one chosen (a radio group).
export function PickerList({ templates, selected, onSelect, thumbOf }: Omit<Props, 'sampleOf'>) {
  const t = useTranslations('app.template')
  const label = useCategoryLabel()
  return (
    <div className="mk-pk-list" role="radiogroup">
      {categoriesOf(templates).map((category) => (
        <div key={category} role="group" aria-label={label(category)}>
          <p className="mk-pk-cat" aria-hidden>
            {label(category)}
          </p>
          {templates
            .filter((template) => template.category === category)
            .map((template) => {
              const thumb = thumbOf(template)
              return (
                <button key={template.id} type="button" role="radio" aria-checked={template.id === selected.id} className="mk-pk-row" onClick={() => onSelect(template.id)}>
                  {thumb ? <GroundedImg className="mk-pk-th" ground="white" {...thumbImage(thumb, 44)} alt="" /> : <span className="mk-pk-th" aria-hidden />}
                  <span className="mk-pk-t">
                    <b>{template.name}</b>
                    {template.description ? <small>{template.description}</small> : null}
                  </span>
                  <span className="mk-cost">{t('fromCredits', { count: template.creditsCost['1k'] })}</span>
                </button>
              )
            })}
        </div>
      ))}
    </div>
  )
}
