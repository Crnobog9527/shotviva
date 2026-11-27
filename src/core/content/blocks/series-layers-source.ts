import { pairsIn, type LayerPair } from './series-layers'

// The later pairs of every public series card, by card key (TemplateCard.id), from
// /api/home/series: the same cached catalogue the page was drawn from, shared by every visitor
// (no cookies). Asked for once per page, the first time any series card plays; a failed request
// is asked again on the next play, and until then the card stays on its first pair.
export type SeriesLayers = ReadonlyMap<string, readonly LayerPair[]>

let request: Promise<SeriesLayers> | null = null

async function fetchLayers(locale: string): Promise<SeriesLayers> {
  const response = await fetch(`/api/home/series?locale=${encodeURIComponent(locale)}`, { credentials: 'omit' })
  if (!response.ok) throw new Error('Series layers unavailable')
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object') return new Map()
  return new Map(Object.entries(body).map(([key, pairs]) => [key, pairsIn(pairs)]))
}

export function seriesLayers(locale: string): Promise<SeriesLayers> {
  request ??= fetchLayers(locale).catch((error: unknown) => {
    request = null
    throw error
  })
  return request
}
