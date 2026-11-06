import type { UploadState } from './use-upload'

// The photos picked for one workspace run (ARCHITECTURE §6.2 "批量上传的语义"): one for Starter
// and no tier, up to the tier's batchMax (Pro 10, Max 30) otherwise. Each uploads on its own
// (Compressing → Uploading → Uploaded) and becomes its own job. Pure, so it can be tested.

export type BatchPhoto = { id: string; url: string; bytes: number; ratio: string | null; upload: UploadState }

// Photos compressing or uploading at once: enough to keep a phone busy without three dozen
// canvases and PUTs fighting over memory and bandwidth.
export const UPLOAD_SLOTS = 3

// Which picked files fit. `room` is what is left under batchMax; the rest are dropped and the
// workspace says so (Starter keeps the first photo, Pro the first 10).
export function takeBatch<T>(files: readonly T[], room: number): { accepted: T[]; dropped: number } {
  const accepted = files.slice(0, Math.max(0, room))
  return { accepted, dropped: files.length - accepted.length }
}

const isBusy = (photo: BatchPhoto) => photo.upload.phase === 'compressing' || photo.upload.phase === 'uploading'

// Waiting photos ('idle') to start now, in pick order, without going over UPLOAD_SLOTS.
export function uploadsToStart(photos: readonly BatchPhoto[], slots = UPLOAD_SLOTS): string[] {
  const free = Math.max(0, slots - photos.filter(isBusy).length)
  return photos
    .filter((photo) => photo.upload.phase === 'idle')
    .slice(0, free)
    .map((photo) => photo.id)
}

export type ReadyPhoto = { photo: BatchPhoto; inputKey: string }

export type BatchSummary = {
  // What the action bar waits for: nothing picked, still uploading, or ready to generate.
  photo: 'none' | 'uploading' | 'ready'
  ready: ReadyPhoto[]
  // Photos that will be generated once uploads finish: everything but failed uploads. The
  // cost pre-check counts these, so "Get credits" shows before the uploads end.
  planned: number
}

export function summarize(photos: readonly BatchPhoto[]): BatchSummary {
  const ready = photos.flatMap((photo) => (photo.upload.phase === 'done' ? [{ photo, inputKey: photo.upload.inputKey }] : []))
  const planned = photos.filter((photo) => photo.upload.phase !== 'error').length
  const uploading = photos.some((photo) => photo.upload.phase !== 'done' && photo.upload.phase !== 'error')
  return { photo: uploading ? 'uploading' : ready.length > 0 ? 'ready' : 'none', ready, planned }
}
