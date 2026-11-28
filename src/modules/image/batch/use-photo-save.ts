'use client'

import { useEffect, useRef, useState } from 'react'

import { usePaywall } from '@/core/billing/paywall/provider'

import { canShareChunk, fetchChunk, nextChunk, shareChunk, type PhotoLink, type PhotoLinksOutcome } from './photo-save'

export type PhotoSaveState =
  | { kind: 'idle' }
  | { kind: 'preparing' }
  | { kind: 'ready'; count: number; saved: number; total: number }
  | { kind: 'saving' }
  | { kind: 'done'; total: number }
  | { kind: 'limited' }
  | { kind: 'error'; code: string }
  // This phone's browser will not hand these photos to the share sheet: use the ZIP.
  | { kind: 'unsupported' }

// Two taps per group, because iOS only opens the share sheet from a tap and the photos must be
// fetched first: tap 1 asks the route for the links and loads the first ten photos, tap 2 (ready)
// opens the share sheet with those files at once. After each group the next ten load on their own
// and the button waits for the next tap. Closing the sheet leaves the same group ready.
// What the button shows after the route did not hand over links. 'packing' keeps the spinner:
// another request holds the batch and we ask again after Retry-After.
function stateAfterFailure(outcome: Exclude<PhotoLinksOutcome, { kind: 'ready' }>): PhotoSaveState {
  if (outcome.kind === 'packing') return { kind: 'preparing' }
  if (outcome.kind === 'limited') return { kind: 'limited' }
  if (outcome.kind === 'upgrade') return { kind: 'idle' }
  return { kind: 'error', code: outcome.code }
}

// links: where the photos' links come from: a batch's route (requestPhotoLinks), or Photos'
// picked works (bulk-save.ts). Read on each ask, so the latest one is used.
export type PhotoLinkSource = () => Promise<PhotoLinksOutcome>

// The latest value, readable from a callback that outlives the render it was made in.
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref
}

export function usePhotoSave(links: PhotoLinkSource) {
  const source = useLatest(links)
  const [state, setState] = useState<PhotoSaveState>({ kind: 'idle' })
  const paywall = usePaywall()
  const photos = useRef<PhotoLink[]>([])
  // The group ready for the sheet: its files, and their links (what is marked saved after).
  const group = useRef<{ files: File[]; links: PhotoLink[] }>({ files: [], links: [] })
  // Names of photos already handed to the share sheet; kept across re-fetched links.
  const saved = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const ready = (): PhotoSaveState => ({ kind: 'ready', count: group.current.files.length, saved: saved.current.size, total: photos.current.length })

  const load = async () => {
    setState({ kind: 'preparing' })
    const links = nextChunk(photos.current, saved.current)
    const fetched = await fetchChunk(links)
    if (!alive.current) return
    if (!fetched) {
      // Links lapse after a while: forget them so the next tap asks the route again.
      photos.current = []
      return setState({ kind: 'error', code: 'NETWORK' })
    }
    if (!canShareChunk(navigator, fetched)) return setState({ kind: 'unsupported' })
    group.current = { files: fetched, links }
    setState(ready())
  }

  const ask = async () => {
    setState({ kind: 'preparing' })
    const outcome = await source.current()
    if (!alive.current) return
    if (outcome.kind === 'ready') {
      photos.current = outcome.photos
      return load()
    }
    if (outcome.kind === 'upgrade') paywall.open('tier_required', { step: 'period', tier: outcome.tier })
    if (outcome.kind === 'packing') timer.current = setTimeout(() => void ask(), outcome.retryAfterMs)
    if (outcome.kind === 'limited') timer.current = setTimeout(() => setState({ kind: 'idle' }), outcome.retryAfterMs)
    setState(stateAfterFailure(outcome))
  }

  const save = () => {
    // No await before share(): the tap's permission to open the sheet lasts only that long.
    const { files, links } = group.current
    setState({ kind: 'saving' })
    void shareChunk(navigator, files).then((result) => {
      if (!alive.current) return
      if (result === 'failed') return setState({ kind: 'unsupported' })
      if (result === 'cancelled') return setState(ready())
      links.forEach((link) => saved.current.add(link.name))
      if (!nextChunk(photos.current, saved.current).length) return setState({ kind: 'done', total: photos.current.length })
      void load()
    })
  }

  const start = () => void (photos.current.length ? load() : ask())
  const press = () => (state.kind === 'ready' ? save() : state.kind === 'idle' || state.kind === 'error' ? start() : undefined)

  return { state, press }
}
