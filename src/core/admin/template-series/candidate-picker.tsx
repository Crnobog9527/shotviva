'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'

import { seriesCopy as copy } from './copy'
import type { CandidatePage, SearchCandidates, SeriesCandidate } from './types'

type Props = {
  seriesId: string | null; selected: ReadonlySet<string>; search: SearchCandidates; initial: CandidatePage
  add: (member: SeriesCandidate) => void
}

export function CandidatePicker({ seriesId, selected, search, initial, add }: Props) {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(initial)
  const [error, setError] = useState('')
  const [busy, run] = useTransition()
  function load(term: string, after: string | null) {
    run(async () => {
      setError('')
      try {
        const result = await search(term, after)
        if (!result.ok) return setError(result.message)
        setQuery(term)
        setPage(prev => ({ items: after ? [...prev.items, ...result.value.items] : result.value.items, next: result.value.next }))
      } catch { setError(copy.transient) }
    })
  }
  return (
    <section className="grid content-start gap-3 rounded-md border p-3">
      <h2 className="font-medium">{copy.candidates}</h2>
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (!busy) load(text, null) }}>
        <Input type="search" aria-label={copy.search} placeholder={copy.search} maxLength={160}
          value={text} onChange={e => setText(e.target.value)} />
        <Button type="submit" variant="outline" disabled={busy}>{copy.searchButton}</Button>
      </form>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      {!page.items.length && <p className="text-muted-foreground text-sm">{copy.noMatch}</p>}
      <ul className="max-h-96 overflow-y-auto">
        {page.items.map(m => {
          const other = !!m.series_id && m.series_id !== seriesId
          const included = selected.has(m.id)
          return (
            <li key={m.id} className="flex items-center gap-2 border-b py-2">
              <div className="mr-auto"><p className="text-sm">{m.name}</p>
                <span className="text-muted-foreground text-xs">{m.id} · {m.is_active ? copy.published : copy.unpublished}</span>
              </div>
              <Button size="sm" variant="outline" disabled={other || included} onClick={() => add(m)}>
                {other ? copy.other : included ? copy.included : copy.add}
              </Button>
            </li>
          )
        })}
      </ul>
      {page.next && <Button variant="outline" disabled={busy} onClick={() => load(query, page.next)}>{copy.more}</Button>}
    </section>
  )
}
