export type Membership = { id: string; seriesId: string | null }

// The target series' members after a batch joins it: the ones it had, in their order, then the
// newcomers in the order they were ticked. null when nothing changes (all were members already).
export function nextMembers(current: readonly string[], joining: readonly string[]): string[] | null {
  const have = new Set(current)
  const added = joining.filter(id => !have.has(id))
  return added.length ? [...current, ...added] : null
}
