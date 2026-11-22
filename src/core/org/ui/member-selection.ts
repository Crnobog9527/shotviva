'use client'

import { useMemo, useState } from 'react'

import type { ConsoleMember } from '../console/types'

// The owner's member list in selection mode (ARCHITECTURE §6.5 「默认额度与批量」): a text filter
// (account) and a joined-on-or-after date narrow the list; select-all takes what is shown.
export type MemberFilter = { query: string; joinedFrom: string }

export function filterMembers(members: readonly ConsoleMember[], filter: MemberFilter): ConsoleMember[] {
  const query = filter.query.trim().toLowerCase()
  const from = filter.joinedFrom ? Date.parse(`${filter.joinedFrom}T00:00:00Z`) : Number.NaN
  return members.filter((m) =>
    (!query || (m.account ?? '').toLowerCase().includes(query) || m.userId.startsWith(query))
    && (Number.isNaN(from) || Date.parse(m.joinedAt) >= from))
}

export function useMemberSelection(members: readonly ConsoleMember[]) {
  const [selecting, setSelecting] = useState(false)
  const [filter, setFilter] = useState<MemberFilter>({ query: '', joinedFrom: '' })
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const shown = useMemo(() => (selecting ? filterMembers(members, filter) : [...members]), [members, filter, selecting])
  // Only members still listed count (one may have been removed since it was ticked).
  const selected = members.filter((m) => picked.has(m.userId)).map((m) => m.userId)
  const allShown = shown.length > 0 && shown.every((m) => picked.has(m.userId))
  return {
    selecting, filter, shown, selected, allShown,
    start: () => setSelecting(true),
    stop: () => { setSelecting(false); setPicked(new Set()); setFilter({ query: '', joinedFrom: '' }) },
    setFilter: (next: Partial<MemberFilter>) => setFilter((f) => ({ ...f, ...next })),
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
