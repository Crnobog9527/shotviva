'use client'

import { useMemo, useState } from 'react'

import type { ConsoleMember } from '../console/types'

// The owner's member list (ARCHITECTURE §6.5 「默认额度与批量」): a text filter (account) and a
// joined-on-or-after date always narrow the list; in selection mode select-all takes what the
// filter shows (all pages of it).
export type MemberFilter = { query: string; joinedFrom: string }

export function filterMembers(members: readonly ConsoleMember[], filter: MemberFilter): ConsoleMember[] {
  const query = filter.query.trim().toLowerCase()
  const from = filter.joinedFrom ? Date.parse(`${filter.joinedFrom}T00:00:00Z`) : Number.NaN
  return members.filter((m) =>
    (!query || (m.account ?? '').toLowerCase().includes(query) || m.userId.startsWith(query))
    && (Number.isNaN(from) || Date.parse(m.joinedAt) >= from))
}

// The list shows this many rows at a time; "show more" adds another page.
export const PAGE_SIZE = 30

// Owner first, then by account (accounts that cannot be read last), then by id so the order is stable.
export function sortMembers(members: readonly ConsoleMember[]): ConsoleMember[] {
  const rank = (m: ConsoleMember) => (m.role === 'owner' ? 0 : 1)
  return [...members].sort((a, b) =>
    rank(a) - rank(b)
    || Number(a.account === null) - Number(b.account === null)
    || (a.account ?? '').localeCompare(b.account ?? '', 'en', { sensitivity: 'base' })
    || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))
}

// One editor open at a time: opening another row closes the open one; tapping the open row closes it.
export const toggleOpen = (open: string | null, id: string): string | null => (open === id ? null : id)

export function useMemberSelection(members: readonly ConsoleMember[], initialOpen: string | null = null) {
  const [selecting, setSelecting] = useState(false)
  const [filter, setFilter] = useState<MemberFilter>({ query: '', joinedFrom: '' })
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [open, setOpen] = useState<string | null>(initialOpen)
  const sorted = useMemo(() => sortMembers(members), [members])
  const shown = useMemo(() => filterMembers(sorted, filter), [sorted, filter])
  const visible = shown.slice(0, limit)
  // Only members shown by the current filter count, so a bulk action never reaches someone the
  // owner can no longer see (and no one removed since they were ticked).
  const selected = shown.filter((m) => picked.has(m.userId)).map((m) => m.userId)
  const allShown = shown.length > 0 && shown.every((m) => picked.has(m.userId))
  return {
    selecting, filter, shown, visible, selected, allShown, open,
    hidden: shown.length - visible.length,
    start: () => { setSelecting(true); setOpen(null) },
    stop: () => { setSelecting(false); setPicked(new Set()) },
    setFilter: (next: Partial<MemberFilter>) => { setFilter((f) => ({ ...f, ...next })); setLimit(PAGE_SIZE) },
    showMore: () => setLimit((n) => n + PAGE_SIZE),
    toggleOpen: (id: string) => setOpen((o) => toggleOpen(o, id)),
    toggle: (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n }),
    toggleAll: () => setPicked((p) => {
      const n = new Set(p)
      for (const m of shown) if (allShown) n.delete(m.userId); else n.add(m.userId)
      return n
    }),
    clear: () => setPicked(new Set()),
  }
}

export type MemberSelection = ReturnType<typeof useMemberSelection>
