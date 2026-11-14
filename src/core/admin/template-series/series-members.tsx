'use client'

import { useMemo } from 'react'

import { SortableList } from '../ui/sortable'
import { MemberRow } from './member-row'
import { seriesCopy as copy } from './copy'
import type { SeriesCandidate } from './types'

type Props = {
  members: SeriesCandidate[]
  change: (next: SeriesCandidate[]) => void
  cover: string | null
  chooseCover: (url: string) => void
}

export function SeriesMembers({ members, change, cover, chooseCover }: Props) {
  const byId = useMemo(() => new Map(members.map(m => [m.id, m])), [members])
  const ids = useMemo(() => members.map(m => m.id), [members])
  return (
    <section className="grid gap-2">
      <h2 className="font-medium">{copy.members}（{members.length}）</h2>
      {!members.length && <p className="text-muted-foreground text-sm">{copy.emptyMembers}</p>}
      <ul>
        <SortableList ids={ids} labelOf={id => byId.get(id)?.name ?? id}
          onReorder={async next => change(next.map(id => byId.get(id)!))}>
          {order => order.map(id => <MemberRow key={id} member={byId.get(id)!} currentCover={cover}
            chooseCover={chooseCover} remove={() => change(members.filter(m => m.id !== id))} />)}
        </SortableList>
      </ul>
    </section>
  )
}
