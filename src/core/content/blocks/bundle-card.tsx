import { useTranslations } from 'next-intl'

import type { TemplateCard } from '../page-content'
import { SeriesPairs } from './series-card'
import { BUNDLE_FIRST_ATTR, BUNDLE_LABEL_ATTR } from './series-layers'
import type { TemplateLookup } from './template-grid'

type Props = { card: TemplateCard; media: TemplateLookup; sizes: string }

// A 精选组合 card (Owner 2026-11-25): the series card's frame and crossfade over templates from any
// categories. Clicking it picks the template on show into the generator, as a template card
// does; the bundle's templates are named under it, each a way to pick that one. Names and the
// count are in the HTML (建站规格 R5); no new address.
export function BundleCard({ card, media, sizes }: Props) {
  const t = useTranslations('marketing.home')
  const bundle = card.bundle
  const first = bundle?.members[0]
  if (!bundle || !first) return null
  // The accessible name says which template a press picks; the crossfade keeps it current.
  const label = (template: string) => t('bundleAria', { name: card.name, template })
  const firstName = bundle.templates.find((template) => template.id === first)?.name ?? ''
  return (
    <div className="mk-bundle">
      <button type="button" className="mk-tpl mk-series" data-pick-template={first} aria-label={label(firstName)}
        {...{ [BUNDLE_FIRST_ATTR]: first, [BUNDLE_LABEL_ATTR]: label('%s') }}>
        <span className="mk-sstack" aria-hidden>
          <span className="mk-sprint mk-sprint-back" aria-hidden />
          <span className="mk-sprint mk-sprint-mid" aria-hidden />
          <span className="mk-sframe">
            <SeriesPairs card={card} media={media} size="card" sizes={sizes} />
            <span className="mk-sbadge" aria-hidden>{t('bundleBadge')}</span>
          </span>
        </span>
        <span className="mk-tpl-meta">
          <b>{card.name}</b>
          <span className="mk-scount">{t('bundleCount', { count: bundle.templates.length })}</span>
        </span>
      </button>
      <ul className="mk-bundle-names">
        {bundle.templates.map((template) => (
          <li key={template.id}>
            <button type="button" data-pick-template={template.id}>{template.name}</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
