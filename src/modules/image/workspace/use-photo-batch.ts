'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useUpdateHold } from '@/core/app-update'

import { summarize, takeBatch, uploadsToStart, type BatchPhoto } from './photo-batch'
import { naturalSize, nearestRatio } from './photo-ratio'
import { isAbort, UploadError, uploadPhoto } from '@/core/storage/upload'
import { uploadDeps, type UploadState } from './use-upload'

// file is null for a kept photo (Make again, T40): it is already in R2, so nothing uploads.
type Entry = BatchPhoto & { file: File | null }

function failed(error: unknown): UploadState {
  const known = error instanceof UploadError
  return { phase: 'error', code: known ? error.code : 'UPLOAD_FAILED', message: known ? error.message : 'Upload failed; please try again' }
}

// Runs the uploads: starts waiting photos as slots free up (UPLOAD_SLOTS) and returns the
// cancel for one photo. The controller map also guards against starting a photo twice.
function useBatchUploads(entries: Entry[], patch: (id: string, change: Partial<Entry>) => void) {
  const controllers = useRef(new Map<string, AbortController>())

  useEffect(() => {
    const running = controllers.current
    for (const id of uploadsToStart(entries)) {
      const entry = entries.find((candidate) => candidate.id === id)
      if (!entry?.file || running.has(id)) continue
      const controller = new AbortController()
      running.set(id, controller)
      patch(id, { upload: { phase: 'compressing', progress: 0 } })
      uploadPhoto(entry.file, uploadDeps, {
        signal: controller.signal,
        onPhase: (phase) => patch(id, { upload: { phase, progress: 0 } }),
        onProgress: (progress) => patch(id, { upload: { phase: 'uploading', progress } }),
      })
        .then((inputKey) => patch(id, { upload: { phase: 'done', inputKey } }))
        .catch((error: unknown) => (isAbort(error) ? undefined : patch(id, { upload: failed(error) })))
        .finally(() => running.delete(id))
    }
  }, [entries, patch])

  return (id: string) => {
    controllers.current.get(id)?.abort()
    controllers.current.delete(id)
  }
}

// The workspace's photos (T28): up to `batchMax`, each uploading on its own, three at a time,
// each cancellable. With batchMax 1 (Starter, no tier) a new pick replaces the photo, as the
// single-photo workspace always did. `dropped` is how many of the last pick did not fit.
// `kept` starts the list with photos kept from an earlier work (Make again), ready to generate.
export function usePhotoBatch(batchMax: number, kept?: KeptStart) {
  const [entries, setEntries] = useState<Entry[]>(() => keptEntries(kept, batchMax))
  const [dropped, setDropped] = useState(0)
  const patch = useCallback((id: string, change: Partial<Entry>) => {
    setEntries((list) => list.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)))
  }, [])
  const cancel = useBatchUploads(entries, patch)
  useBatchHolds(entries)
  useKeptRatios(entries, patch)

  const add = (files: readonly File[]) => {
    const replacing = batchMax <= 1
    if (replacing) entries.forEach((entry) => cancel(entry.id))
    const kept = replacing ? [] : entries
    const { accepted, dropped: over } = takeBatch(files, batchMax - kept.length)
    setDropped(over)
    setEntries([...kept, ...accepted.map((file) => newEntry(file, patch))])
  }

  const remove = (id: string) => {
    cancel(id)
    const gone = entries.find((entry) => entry.id === id)
    if (gone?.file) URL.revokeObjectURL(gone.url)
    setEntries((list) => list.filter((entry) => entry.id !== id))
    setDropped(0)
  }

  // After a batch: the previews stay alive (the jobs show them), the list empties.
  const clear = () => {
    entries.forEach((entry) => cancel(entry.id))
    setEntries([])
    setDropped(0)
  }

  return { photos: entries as BatchPhoto[], summary: summarize(entries), dropped, batchMax, add, remove, clear }
}

export type PhotoBatch = ReturnType<typeof usePhotoBatch>

export type KeptStart = { photos: readonly { inputKey: string; bytes: number; url: string }[]; madeAt: string }

// Ids are positional so the server render and hydration agree.
function keptEntries(kept: KeptStart | undefined, batchMax: number): Entry[] {
  return (kept?.photos ?? []).slice(0, batchMax).map((photo, index) => ({
    id: `kept-${index}`,
    file: null,
    url: photo.url,
    bytes: photo.bytes,
    ratio: null,
    upload: { phase: 'done', inputKey: photo.inputKey },
    keptFrom: kept?.madeAt,
  }))
}

// The "4:5 · as shot" readout for kept photos, once the browser has their size.
function useKeptRatios(entries: Entry[], patch: (id: string, change: Partial<Entry>) => void) {
  const asked = useRef(new Set<string>())
  useEffect(() => {
    for (const entry of entries) {
      if (!entry.keptFrom || entry.ratio || asked.current.has(entry.id)) continue
      asked.current.add(entry.id)
      void naturalSize(entry.url)
        .then(({ width, height }) => patch(entry.id, { ratio: nearestRatio(width, height), originalRatio: width / height }))
        .catch(() => undefined)
    }
  }, [entries, patch])
}

function newEntry(file: File, patch: (id: string, change: Partial<Entry>) => void): Entry {
  const id = crypto.randomUUID()
  const url = URL.createObjectURL(file)
  // The ratio readout fills in once the browser has decoded the photo; upload does not wait.
  void naturalSize(url)
    .then(({ width, height }) => patch(id, { ratio: nearestRatio(width, height), originalRatio: width / height }))
    .catch(() => undefined)
  return { id, file, url, bytes: file.size, name: file.name, ratio: null, upload: { phase: 'idle' } }
}

// The new-version banner (T90) waits while a photo uploads, and says a refresh drops the picked
// photos: they live in this tab's memory only. Kept photos (Make again) come back with the URL.
function useBatchHolds(entries: Entry[]) {
  useUpdateHold('upload', entries.some((entry) => entry.upload.phase === 'compressing' || entry.upload.phase === 'uploading'))
  useUpdateHold('photos', entries.some((entry) => entry.file !== null))
}

// A slot template's photos (§5.1e): at most one per named slot, each uploading on its own like a
// batch photo (same three-at-a-time limit, same holds). Entries are keyed by slot, so a photo can
// only ever be in its own box. `kept` (Make again) puts each kept photo back in its slot.
export type SlotKept = { photos: readonly { inputKey: string; bytes: number; url: string; slot?: string }[]; madeAt: string }

export function useSlotPhotos(slots: readonly { key: string; required: boolean }[], kept?: SlotKept) {
  const [entries, setEntries] = useState<Entry[]>(() => keptSlotEntries(kept))
  const patch = useCallback((id: string, change: Partial<Entry>) => {
    setEntries((list) => list.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)))
  }, [])
  const cancel = useBatchUploads(entries, patch)
  useBatchHolds(entries)
  useRevokeSlotPreviews(entries)

  const drop = (slot: string) => {
    cancel(slot)
    const gone = entries.find((entry) => entry.id === slot)
    if (gone?.file) URL.revokeObjectURL(gone.url)
  }
  const set = (slot: string, file: File) => {
    drop(slot)
    setEntries((list) => [...list.filter((entry) => entry.id !== slot), { ...newEntry(file, patch), id: slot }])
  }
  const remove = (slot: string) => {
    drop(slot)
    setEntries((list) => list.filter((entry) => entry.id !== slot))
  }
  // Switching series members (or a template edit) keeps only slots the template still has.
  const keys = slots.map((slot) => slot.key)
  const shown = entries.filter((entry) => keys.includes(entry.id))
  return { byKey: Object.fromEntries(shown.map((entry) => [entry.id, entry as BatchPhoto])), status: slotStatus(slots, shown), uploads: slotUploads(keys, shown), set, remove }
}

export type SlotPhotos = ReturnType<typeof useSlotPhotos>

// On leaving the form: the slot photos' local previews go. A slot job never shows its uploads
// (no input preview, §5.1e), so none is still in use. (#543's useRevokeOnLeave does the same for
// the photo list; the two can share one helper once both are on main.)
function useRevokeSlotPreviews(entries: Entry[]) {
  const latest = useRef(entries)
  useEffect(() => {
    latest.current = entries
  }, [entries])
  useEffect(() => {
    const current = latest
    return () => {
      for (const entry of current.current) if (entry.file) URL.revokeObjectURL(entry.url)
    }
  }, [])
}

function keptSlotEntries(kept: SlotKept | undefined): Entry[] {
  return (kept?.photos ?? []).flatMap((photo) => (photo.slot
    ? [{ id: photo.slot, file: null, url: photo.url, bytes: photo.bytes, ratio: null, upload: { phase: 'done' as const, inputKey: photo.inputKey }, keptFrom: kept?.madeAt }]
    : []))
}

// What Generate waits for: a required slot still empty, any slot still uploading, or any slot
// whose upload failed (optional or not: it must be picked again or removed, never silently
// dropped from a paid job).
export function slotStatus(slots: readonly { key: string; required: boolean }[], entries: readonly BatchPhoto[]): 'none' | 'uploading' | 'ready' {
  if (entries.some((entry) => entry.upload.phase === 'compressing' || entry.upload.phase === 'uploading' || entry.upload.phase === 'idle')) return 'uploading'
  if (entries.some((entry) => entry.upload.phase === 'error')) return 'none'
  const done = new Set(entries.filter((entry) => entry.upload.phase === 'done').map((entry) => entry.id))
  return slots.some((slot) => slot.required && !done.has(slot.key)) ? 'none' : 'ready'
}

// input_slots for /api/generate: the uploaded slots, in slot order.
export function slotUploads(keys: readonly string[], entries: readonly BatchPhoto[]): Record<string, string> {
  return Object.fromEntries(keys.flatMap((key) => {
    const entry = entries.find((candidate) => candidate.id === key)
    return entry?.upload.phase === 'done' ? [[key, entry.upload.inputKey]] : []
  }))
}
