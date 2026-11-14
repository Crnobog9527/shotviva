'use client'

import { useEffect, useRef, useState } from 'react'

import type { PosterContent } from '@/core/poster'
import { fillPoster } from '@/core/store-profile'

import { fetchLastIssue, fetchStoreQr, fetchWeeklyPeek, turnAutofillOff } from '../again/weekly-api'
import type { WeeklyPeek } from '../again/weekly'
import { isSampleText } from './content-edit'
import type { PosterStudioState, StudioTemplate } from './use-poster-studio'

// 每周复用 in the poster editor (ARCHITECTURE §5.3): 用上一期 opens the editor on the newest set
// this account made with the template or another style of its series; 店铺信息 fills the
// organiser, phones, address and QR code. Nothing the user typed is replaced without asking:
// the store fills only empty or sample fields by itself, and 用上一期 asks once the editor holds
// the user's own words.

type Store = NonNullable<WeeklyPeek['store']>
export type StoreNote = { changed: string[]; before: PosterContent; qr: boolean }

const asText = (content: PosterContent) => JSON.stringify(content)

function useWeeklyPeek(templateId: string, also: readonly string[]) {
  const [peek, setPeek] = useState<WeeklyPeek | null>(null)
  const key = also.join(',')
  useEffect(() => {
    const controller = new AbortController()
    void fetchWeeklyPeek(templateId, key ? key.split(',') : [], controller.signal).then((value) => { if (!controller.signal.aborted) setPeek(value) })
    return () => controller.abort()
  }, [templateId, key])
  return peek
}

// The store's QR code into the template's QR box, when it has one and the box is empty.
async function fillQr(template: StudioTemplate, studio: PosterStudioState, store: Store): Promise<boolean> {
  const slot = template.poster.qr?.slot
  if (!slot || !store.hasQr || studio.photos.byKey[slot]) return false
  const qr = await fetchStoreQr(template.id)
  if (!qr) return false
  studio.photos.restore({ ...qr, slot })
  return true
}

export function usePosterWeekly(template: StudioTemplate, studio: PosterStudioState, also: readonly string[]) {
  const peek = useWeeklyPeek(template.id, also)
  const store = peek?.store ?? null
  const [storeNote, setStoreNote] = useState<StoreNote | null>(null)
  const [autofill, setAutofill] = useState(true)
  const [lastBusy, setLastBusy] = useState(false)
  const [lastFailed, setLastFailed] = useState(false)
  // The content as the editor opened (after any automatic fill): anything else is the user's.
  const baseline = useRef<string | null>(null)
  const applied = useRef(false)
  const sample = template.poster.sample
  const { ready, draft } = studio

  const fillStore = async (force: boolean) => {
    if (!store) return
    const before = draft.content
    const filled = fillPoster(before, store, (path) => force || isSampleText(before, sample, path))
    if (filled.changed.length) studio.update(() => filled.content)
    const qr = await fillQr(template, studio, store)
    if (filled.changed.length || qr) setStoreNote({ changed: filled.changed, before, qr })
    return filled.content
  }

  // Once per opening: the stored draft is read (ready) and the store details are known.
  useEffect(() => {
    if (!ready || !peek || applied.current) return
    applied.current = true
    if (!store?.autofill) { baseline.current = asText(draft.content); return }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the store details arrive after mount
    void fillStore(false).then((content) => { baseline.current = asText(content ?? draft.content) })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when both are in
  }, [ready, peek])

  // A sorted paste or a read photo replaces the whole text: the store fills what it left empty.
  const replaced = draft.sorted || draft.origin?.source === 'photo'
  useEffect(() => {
    if (!replaced || !store?.autofill || !autofill) return
    const filled = fillPoster(draft.content, store)
    if (filled.changed.length) studio.update((content) => fillPoster(content, store).content)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per replacement
  }, [replaced])

  const dirty = () => baseline.current !== null && asText(draft.content) !== baseline.current

  async function takeLast() {
    setLastBusy(true)
    setLastFailed(false)
    const issue = await fetchLastIssue(template.id, also)
    setLastBusy(false)
    if (!issue || issue.kind !== 'poster') return setLastFailed(true)
    studio.startFrom(issue.content, { source: 'reuse', madeAt: issue.madeAt, templateId: issue.templateId })
    const slots = new Set(template.slots.map((slot) => slot.key))
    for (const photo of issue.photos) if (photo.slot && slots.has(photo.slot)) studio.photos.restore({ ...photo, slot: photo.slot }, issue.madeAt)
    setStoreNote(null)
  }

  return {
    peek, store, storeNote, autofill: autofill && Boolean(store?.autofill), lastBusy, lastFailed, dirty, takeLast,
    fillStore: () => void fillStore(true),
    // Typed values a manual fill would replace (asked first).
    storeConflicts: () => (store ? fillPoster(draft.content, store, () => true).changed.length
      > fillPoster(draft.content, store, (path) => isSampleText(draft.content, sample, path)).changed.length : false),
    undoStore: () => {
      if (!storeNote) return
      studio.update(() => storeNote.before)
      const slot = template.poster.qr?.slot
      if (storeNote.qr && slot) studio.photos.remove(slot)
      setStoreNote(null)
    },
    autofillOff: () => { setAutofill(false); void turnAutofillOff(template.id) },
  }
}

export type PosterWeekly = ReturnType<typeof usePosterWeekly>
