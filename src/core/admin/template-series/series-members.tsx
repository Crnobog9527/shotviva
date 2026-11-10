'use client'

import { useMemo } from 'react'

import { Button } from '@/core/ui/button'
import { DragHandle, MoveButtons, SortableList, sortableRowClass, useSortableItem } from '../ui/sortable'
import { seriesCopy as copy } from './copy'
import type { SeriesCandidate } from './types'

type Props = {
  members: SeriesCandidate[]
  change: (next: SeriesCandidate[]) => void
  cover: string | null
  chooseCover: (url: string) => void
}

function MemberRow({ member, remove, currentCover, chooseCover }: {
  member: SeriesCandidate; remove: () => void; currentCover: string | null; chooseCover: (url: string) => void
}) {
  const item = useSortableItem(member.id)
  const selected = !!member.cover_url && member.cover_url === currentCover
  return (
    <li {...item.row} className={`${sortableRowClass} flex flex-wrap items-center gap-2 border-b py-1.5`}>
      <DragHandle handle={item.handle} /><MoveButtons item={item} />
      {member.cover_url && (
        // The member preview uses the same public still URL that can be picked as the cover.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={member.cover_url} alt="" width={40} height={50} loading="lazy" className="h-12 w-10 rounded object-contain" />
      )}
      <div className="mr-auto min-w-0">
        <p className="break-words text-sm">{member.name}</p>
        <span className="text-muted-foreground text-xs">{member.id} · {member.is_active ? copy.published : copy.unpublished}</span>
      </div>
      <Button type="button" size="sm" variant="outline" disabled={!member.cover_url || selected}
        onClick={() => member.cover_url && chooseCover(member.cover_url)}>{selected ? copy.usingCover : copy.memberCover}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={remove}>{copy.remove}</Button>
    </li>
  )
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
