import type { ActionValue } from '../templates'

export type SeriesFields = {
  slug: string
  name_en: string
  name_zh: string
  description_en: string | null
  description_zh: string | null
  cover_url: string | null
  category_key: string
  sort_order: number
  is_active: boolean
  show_members: boolean
}

export type SeriesCandidate = {
  id: string
  name: string
  cover_url: string | null
  series_id: string | null
  is_active: boolean
}

export type SeriesDetail = SeriesFields & { id: string; revision: string; members: SeriesCandidate[] }
export type SaveSeriesInput = {
  id: string | null
  revision: string | null
  fields: SeriesFields
  members: string[]
  reason: string | null
}
export type CandidatePage = { items: SeriesCandidate[]; next: string | null }
export type SearchCandidates = (search: string, after: string | null) => Promise<ActionValue<CandidatePage>>
export type SeriesActions = { save: (input: SaveSeriesInput) => Promise<ActionValue<string>>; search: SearchCandidates }
