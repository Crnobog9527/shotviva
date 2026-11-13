// The thumbnail each series row shows (Owner 2026-11-12): its own cover_url ('custom'), or else what
// the public card falls back to, the cover of the first member shown on the site ('auto').
export type SeriesRow = {
  id: string; name_zh: string; slug: string; is_active: boolean; show_members: boolean; sort_order: number
  cover_url: string | null
}
export type SeriesListItem = SeriesRow & { thumb: { url: string; kind: 'custom' | 'auto' } | null }
type Member = {
  series_id: string; is_active: boolean; visible_in: string[]
  cover_after_url: string | null; cover_locales: Record<string, unknown> | null
}

function memberCover(member: Member) {
  const localized = (locale: string) => {
    const value = member.cover_locales?.[locale]
    return value && typeof value === 'object' && 'after' in value && typeof value.after === 'string' ? value.after : null
  }
  return member.cover_after_url ?? localized('zh') ?? localized('en')
}

// `members` come ordered by series_sort_order, as the public card reads them.
export function autoCovers(rows: readonly SeriesRow[], members: readonly Member[]): SeriesListItem[] {
  // As web_catalogue_entries: the first member shown on the site, whether or not it has a cover.
  const first = new Map<string, string | null>()
  for (const member of members) {
    if (member.is_active && member.visible_in.includes('web') && !first.has(member.series_id)) {
      first.set(member.series_id, memberCover(member))
    }
  }
  return rows.map(row => {
    const auto = first.get(row.id)
    const thumb = row.cover_url ? { url: row.cover_url, kind: 'custom' as const } : auto ? { url: auto, kind: 'auto' as const } : null
    return { ...row, thumb }
  })
}

// The names the batch confirmation lists, in list order.
export function selectionNames(rows: readonly SeriesRow[], ids: ReadonlySet<string>) {
  return rows.filter(row => ids.has(row.id)).map(row => row.name_zh)
}
