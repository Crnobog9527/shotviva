import type { CatalogueTemplate } from './catalogue-template'
import { seriesOf, type CatalogueSeries, type GridEntry } from './catalogue-view'

// A series of poster templates (e.g. 赛事海报 in three styles, ARCHITECTURE §5.3) opens the poster
// editor, never the creation dialog: those templates take no photo and make their text from the
// confirmed blocks. Its other poster members are offered beside the editor's sample to switch
// style. A series is a poster series once any member is a poster template; only those members
// are offered.

export type PosterSeries = { name: string; members: CatalogueTemplate[] }

const posterMembers = (series: CatalogueSeries) => series.members.filter((member) => member.poster)

// The poster to open for a series, or null when the series is not one of posters.
export const posterStart = (series: CatalogueSeries | null): string | null => (series ? posterMembers(series)[0]?.id ?? null : null)

// The poster series a poster template belongs to, for the editor's style switcher.
export function posterSeriesOf(entries: readonly GridEntry[], id: string | null): PosterSeries | null {
  if (!id) return null
  const series = seriesOf(entries).find((item) => item.members.some((member) => member.id === id && member.poster))
  const members = series ? posterMembers(series) : []
  return series && members.length > 1 ? { name: series.name, members } : null
}
