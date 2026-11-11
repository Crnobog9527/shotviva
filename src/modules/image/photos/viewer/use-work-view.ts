'use client'

import { useEffect, useState } from 'react'

import type { WorkView } from '../work-view'

export type ViewState = { kind: 'loading' } | { kind: 'ready'; view: WorkView } | { kind: 'missing' } | { kind: 'error' }

// Loaded views, per work, for this tab: arrows back to a work, or a card hovered before its
// click, show at once. A view's balance can go stale while it sits here, so an entry lives a
// minute; a failed read is never kept.
const TTL_MS = 60_000
const cache = new Map<string, { at: number; promise: Promise<ViewState> }>()

async function fetchView(id: string): Promise<ViewState> {
  try {
    const response = await fetch(`/api/photos/${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' } })
    if (response.status === 404) return { kind: 'missing' }
    if (!response.ok) return { kind: 'error' }
    return { kind: 'ready', view: (await response.json()) as WorkView }
  } catch {
    return { kind: 'error' }
  }
}

function load(id: string): Promise<ViewState> {
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise
  const promise = fetchView(id).then((state) => {
    if (state.kind === 'error') cache.delete(id)
    return state
  })
  cache.set(id, { at: Date.now(), promise })
  return promise
}

export const prefetchWorkView = (id: string) => void load(id)

// A work's view went out of date (it was deleted, or the balance it carries was just spent).
export const forgetWorkViews = () => cache.clear()

export function useWorkView(id: string | null): { state: ViewState; retry(): void } {
  const [loaded, setLoaded] = useState<{ id: string; state: ViewState } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!id) return
    let live = true
    void load(id).then((state) => live && setLoaded({ id, state }))
    return () => {
      live = false
    }
  }, [id, attempt])
  const state: ViewState = loaded && loaded.id === id ? loaded.state : { kind: 'loading' }
  return { state, retry: () => setAttempt((n) => n + 1) }
}
