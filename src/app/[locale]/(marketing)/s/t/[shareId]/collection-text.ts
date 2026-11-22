import type { getTranslations } from 'next-intl/server'

import type { CollectionPageText, TemplateCollection } from '@/modules/image/template-collection-page'

type Translate = Awaited<ReturnType<typeof getTranslations<'templateShare'>>>

// The page's words in the visitor's language; counts worked out here, so the page needs no
// translator of its own.
export function collectionText(t: Translate, collection: TemplateCollection): CollectionPageText {
  const templates = collection.entries.reduce((sum, entry) => sum + (entry.type === 'series' ? entry.series.members.length : 1), 0)
  const seriesCount = Object.fromEntries(
    collection.entries.flatMap((entry) => (entry.type === 'series' ? [[entry.series.id, t('seriesCount', { count: entry.series.members.length })]] : [])),
  )
  return {
    kicker: t('kicker', { count: templates }),
    title: t('title'),
    hint: t('hint'),
    illustrative: t('illustrative'),
    use: t('use'),
    alt: t('alt'),
    show: t('show'),
    hide: t('hide'),
    badge: t('badge'),
    seriesCount,
  }
}

// The first pick's after cover (a series: its artwork, else its first member's).
export function firstCover({ entries: [first] }: TemplateCollection): string | null {
  if (!first) return null
  if (first.type === 'template') return first.template.cover.after
  return first.series.cover ?? first.series.members[0]?.cover.after ?? null
}
