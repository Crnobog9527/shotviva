// The thumbnail each series row shows (Owner 2026-11-12): its own cover_url ('custom'), or else what
// the public card falls back to, the cover of the first member shown on the site ('auto').
export type SeriesRow = {
  id: string; name_zh: string; slug: string; is_active: boolean; show_members: boolean; sort_order: number
  cover_url: string | null
}
// `before`: the member's 原图 when the thumbnail is that member's cover, for the large preview.
export type SeriesThumb = { url: string; kind: 'custom' | 'auto'; before?: string }
// memberCount: every member, published or not; what 删除 would move out of the series.
export type SeriesListItem = SeriesRow & { thumb: SeriesThumb | null; memberCount: number }
type Member = {
  series_id: string; is_active: boolean; visible_in: string[]
  cover_after_url: string | null; cover_before_url?: string | null; cover_locales: Record<string, unknown> | null
}

function memberCover(member: Member) {
  const localized = (locale: string, slot: 'after' | 'before') => {
    const value: unknown = member.cover_locales?.[locale]
    if (!value || typeof value !== 'object' || !(slot in value)) return null
    const url: unknown = (value as Record<string, unknown>)[slot]
    return typeof url === 'string' ? url : null
  }
  const after = member.cover_after_url ?? localized('zh', 'after') ?? localized('en', 'after')
  const before = member.cover_before_url ?? localized('zh', 'before') ?? localized('en', 'before')
  return after ? { url: after, ...(before ? { before } : {}) } : null
}

// `members` come ordered by series_sort_order, as the public card reads them.
export function autoCovers(rows: readonly SeriesRow[], members: readonly Member[]): SeriesListItem[] {
  // As web_catalogue_entries: the first member shown on the site, whether or not it has a cover.
  const first = new Map<string, ReturnType<typeof memberCover>>()
  const counts = new Map<string, number>()
  for (const member of members) {
    counts.set(member.series_id, (counts.get(member.series_id) ?? 0) + 1)
    if (member.is_active && member.visible_in.includes('web') && !first.has(member.series_id)) {
      first.set(member.series_id, memberCover(member))
    }
  }
  return rows.map(row => {
    const auto = first.get(row.id)
    const thumb: SeriesThumb | null = row.cover_url ? { url: row.cover_url, kind: 'custom' } : auto ? { ...auto, kind: 'auto' } : null
    return { ...row, thumb, memberCount: counts.get(row.id) ?? 0 }
  })
}

// The names the batch confirmation lists, in list order.
export function selectionNames(rows: readonly SeriesRow[], ids: ReadonlySet<string>) {
  return rows.filter(row => ids.has(row.id)).map(row => row.name_zh)
}

// 删除 (Owner 2026-11-14) takes unpublished series only: the confirm step says up front which of the
// ticked ones it will skip and why, and how many templates the rest will move out.
export const LIVE_REASON = '已上架，先下架才能删除'
export function planSeriesDelete<T extends Pick<SeriesListItem, 'id' | 'is_active' | 'memberCount'>>(selected: readonly T[]) {
  const deletable = selected.filter(item => !item.is_active)
  return {
    deletable,
    skipped: selected.filter(item => item.is_active).map(item => ({ item, reason: LIVE_REASON })),
    moved: deletable.reduce((sum, item) => sum + item.memberCount, 0),
  }
}
