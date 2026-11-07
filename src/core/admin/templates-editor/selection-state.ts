// Row selection for the bulk bar (T60). Ids, not rows, so a page refresh keeps the selection.

export type HeaderState = boolean | 'indeterminate'

export function toggleId(selected: ReadonlySet<string>, id: string, on: boolean): Set<string> {
  const next = new Set(selected)
  if (on) next.add(id)
  else next.delete(id)
  return next
}

// The header box speaks for the rows on screen (the search filter), not for hidden selections.
export function headerState(visibleIds: readonly string[], selected: ReadonlySet<string>): HeaderState {
  const picked = visibleIds.filter((id) => selected.has(id)).length
  if (picked === 0) return false
  return picked === visibleIds.length ? true : 'indeterminate'
}

// Ticking the header selects every visible row; unticking drops only the visible ones.
export function toggleVisible(visibleIds: readonly string[], selected: ReadonlySet<string>, on: boolean): Set<string> {
  const next = new Set(selected)
  for (const id of visibleIds) {
    if (on) next.add(id)
    else next.delete(id)
  }
  return next
}

// Selected ids that still exist, in list order (what the dialog names and the server receives).
export function selectedInOrder<T extends { id: string }>(rows: readonly T[], selected: ReadonlySet<string>): T[] {
  return rows.filter((row) => selected.has(row.id))
}
