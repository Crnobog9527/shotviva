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
// with its own way in. Always noindex, never in the sitemap. `viewer` streams the visitor's
// session in (collection-viewer.tsx).
export function TemplateCollectionPage({ collection, text, viewer }: Props) {
  const tile = { use: text.use, alt: text.alt }
  return (
    <article className="mk-w px-(--gutter) py-6 md:py-12">
      <header className="grid max-w-[640px] gap-3">
        <p className="text-caption font-medium text-muted-foreground">{text.kicker}</p>
        <h1 className="font-display text-h1 leading-[1.05] tracking-[-0.02em] text-balance">{collection.title ?? text.title}</h1>
        {collection.note ? <p className="text-body whitespace-pre-line text-pretty text-bone-dim">{collection.note}</p> : null}
        <p className="text-caption text-muted-foreground">{text.hint}</p>
      </header>
      <ul className="mt-8 grid grid-cols-1 gap-x-4 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
        {collection.entries.map((entry, index) =>
          entry.type === 'series' ? (
            <CollectionSeries key={`series-${entry.series.id}`} series={entry.series} eager={index < 2}
              text={{ ...tile, show: text.show, hide: text.hide, badge: text.badge, count: text.seriesCount[entry.series.id] ?? '' } satisfies SeriesText} />
          ) : (
            <li key={entry.template.id}><TemplateTile template={entry.template} text={tile} eager={index < 2} /></li>
          ),
        )}
      </ul>
      <p className="pt-8 text-caption text-muted-foreground">{text.illustrative}</p>
      {viewer}
    </article>
  )
}
