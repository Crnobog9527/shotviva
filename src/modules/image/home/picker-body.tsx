'use client'

import { useTranslations } from 'next-intl'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
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
          {/* eslint-disable-next-line @next/next/no-img-element -- admin cover or bundled sample */}
          <img className="mk-b" src={sample.before} alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element -- admin cover or bundled sample */}
          <img className="mk-a" src={sample.after} alt={t('cardAlt', { name: selected.name })} />
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
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin cover or bundled sample */}
                  {thumb ? <img className="mk-pk-th" src={thumb} alt="" /> : <span className="mk-pk-th" aria-hidden />}
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
