'use client'

import { useEffect, useRef, useState } from 'react'

import { usePaywall } from '@/core/billing/paywall/provider'

import { canShareChunk, fetchChunk, nextChunk, requestPhotoLinks, shareChunk, type PhotoLink, type PhotoLinksOutcome } from './photo-save'

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

export function usePhotoSave(batchId: string) {
  const [state, setState] = useState<PhotoSaveState>({ kind: 'idle' })
  const paywall = usePaywall()
  const photos = useRef<PhotoLink[]>([])
  const files = useRef<File[]>([])
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

  const load = async () => {
    setState({ kind: 'preparing' })
    const group = await fetchChunk(nextChunk(photos.current, saved.current))
    if (!alive.current) return
    if (!group) {
      // Links lapse after a while: forget them so the next tap asks the route again.
      photos.current = []
      setState({ kind: 'error', code: 'NETWORK' })
      return
    }
    if (!canShareChunk(navigator, group)) return setState({ kind: 'unsupported' })
    files.current = group
    setState({ kind: 'ready', count: group.length, saved: saved.current.size, total: photos.current.length })
  }

  const ask = async () => {
    setState({ kind: 'preparing' })
    const outcome = await requestPhotoLinks(batchId)
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
    const group = files.current
    setState({ kind: 'saving' })
    void shareChunk(navigator, group).then((result) => {
      if (!alive.current) return
      if (result === 'failed') return setState({ kind: 'unsupported' })
      if (result === 'cancelled') return setState({ kind: 'ready', count: group.length, saved: saved.current.size, total: photos.current.length })
      group.forEach((file) => saved.current.add(file.name))
      if (!nextChunk(photos.current, saved.current).length) return setState({ kind: 'done', total: photos.current.length })
      void load()
    })
  }

  const press = () => {
    if (state.kind === 'ready') return save()
    if (state.kind === 'idle' || state.kind === 'error') void (photos.current.length ? load() : ask())
  }

  return { state, press }
}
