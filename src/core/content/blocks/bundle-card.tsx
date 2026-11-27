import { useTranslations } from 'next-intl'

import type { TemplateCard } from '../page-content'
import { SeriesPairs } from './series-card'
import { BUNDLE_FIRST_ATTR, BUNDLE_LABEL_ATTR } from './series-layers'
import type { TemplateLookup } from './template-grid'

type Props = { card: TemplateCard; media: TemplateLookup; sizes: string }

// A 精选组合 card (Owner 2026-11-25): the series card's frame and crossfade over templates from any
// categories. Clicking it opens the page's template panel on the template on show, with every
// template of the bundle to switch between; the names under it open it on that one. The card's
// key, name and list say which bundle (modules/image/home/panel/panel-dom.ts). Names and the
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
    <div className="mk-bundle" data-pick-set={`bundle:${card.id}`} data-bundle-key={card.id} data-bundle-name={card.name}>
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
        {bundle.more ? (
          <li>
            {/* The rest of the catalogue (Owner 2026-11-25): the members' shared category, or every
                template, in the page's browse list (no public templates page; Create needs a
                session). A button, as the series cards are, for the generator's handler. */}
            <button type="button" className="mk-bundle-more" data-browse-category={bundle.more.path.join('/')} data-browse-from={first}>
              {bundle.more.name ? t('bundleAllIn', { category: bundle.more.name, count: bundle.more.count }) : t('bundleAll', { count: bundle.more.count })}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  )
}
