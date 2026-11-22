import type { ReactNode } from 'react'

import { CollectionSeries, type SeriesText } from './collection-series'
import type { TemplateCollection } from './load-template-collection'
import { TemplateTile } from './template-tile'

export type CollectionPageText = {
  kicker: string
  title: string
  hint: string
  illustrative: string
  use: string
  alt: string
  show: string
  hide: string
  badge: string
  // "6 templates", per series id.
  seriesCount: Record<string, string>
}

type Props = { collection: TemplateCollection; text: CollectionPageText; viewer: ReactNode }

// /s/t/<id>, a template collection share page (ARCHITECTURE §5.1g, Owner 2026-11-22): the
// sharer's title and note, then only the picked templates and series in the order picked, each
// with its own way in, styled by the route's collection.css (no Tailwind utilities). Always noindex, never in the sitemap. `viewer` streams the visitor's
// session in (collection-viewer.tsx).
export function TemplateCollectionPage({ collection, text, viewer }: Props) {
  const tile = { use: text.use, alt: text.alt }
  return (
    <article className="mk-w tc-page">
      <header className="tc-head">
        <p className="tc-kicker">{text.kicker}</p>
        <h1 className="tc-title">{collection.title ?? text.title}</h1>
        {collection.note ? <p className="tc-note">{collection.note}</p> : null}
        <p className="tc-hint">{text.hint}</p>
      </header>
      <ul className="tc-grid">
        {collection.entries.map((entry, index) =>
          entry.type === 'series' ? (
            <CollectionSeries key={`series-${entry.series.id}`} series={entry.series} eager={index < 2}
              text={{ ...tile, show: text.show, hide: text.hide, badge: text.badge, count: text.seriesCount[entry.series.id] ?? '' } satisfies SeriesText} />
          ) : (
            <li key={entry.template.id}><TemplateTile template={entry.template} text={tile} eager={index < 2} /></li>
          ),
        )}
      </ul>
      <p className="tc-hint tc-foot">{text.illustrative}</p>
      {viewer}
    </article>
  )
}
