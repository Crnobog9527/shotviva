'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { summarize, takeBatch, uploadsToStart, type BatchPhoto } from './photo-batch'
import { naturalSize, nearestRatio } from './photo-ratio'
import { isAbort, UploadError, uploadPhoto } from './upload-photo'
import { uploadDeps, type UploadState } from './use-upload'

type Entry = BatchPhoto & { file: File }

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
      if (!entry || running.has(id)) continue
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
export function usePhotoBatch(batchMax: number) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [dropped, setDropped] = useState(0)
  const patch = useCallback((id: string, change: Partial<Entry>) => {
    setEntries((list) => list.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)))
  }, [])
  const cancel = useBatchUploads(entries, patch)

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
    if (gone) URL.revokeObjectURL(gone.url)
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

function newEntry(file: File, patch: (id: string, change: Partial<Entry>) => void): Entry {
  const id = crypto.randomUUID()
  const url = URL.createObjectURL(file)
  // The ratio readout fills in once the browser has decoded the photo; upload does not wait.
  void naturalSize(url)
    .then(({ width, height }) => patch(id, { ratio: nearestRatio(width, height) }))
    .catch(() => undefined)
  return { id, file, url, bytes: file.size, ratio: null, upload: { phase: 'idle' } }
}
