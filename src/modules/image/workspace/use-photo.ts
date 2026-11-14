'use client'

import { useCallback, useState } from 'react'

import { useUpdateHold } from '@/core/app-update'

import { naturalSize, nearestRatio } from './photo-ratio'
import { useUpload, type UploadState } from './use-upload'

export type PickedPhoto = { url: string; bytes: number; ratio: string | null }
export type PhotoStatus = 'none' | 'uploading' | 'ready' | 'error'

// The workspace photo: uploads as soon as it is picked (Compressing → Uploading), so Generate
// only has to send the key. The object URL is the on-screen preview; it is kept for the tab's
// life because a running job may still show it.
export function usePhoto() {
  const { state, upload, reset } = useUpload()
  const [photo, setPhoto] = useState<PickedPhoto | null>(null)
  // A refresh would drop it (memory only): the new-version banner says so (T90).
  useUpdateHold('photos', photo !== null)

  const pick = useCallback(
    async (file: File) => {
      const url = URL.createObjectURL(file)
      setPhoto({ url, bytes: file.size, ratio: null })
      // The ratio readout fills in once the browser has decoded the photo; upload does not wait.
      void naturalSize(url)
        .then(({ width, height }) => setPhoto((current) => (current?.url === url ? { ...current, ratio: nearestRatio(width, height) } : current)))
        .catch(() => undefined)
      await upload(file)
    },
    [upload],
  )

  const clear = useCallback(() => {
    setPhoto(null)
    reset()
  }, [reset])

  return { photo, upload: state, status: statusOf(photo, state), inputKey: state.phase === 'done' ? state.inputKey : null, pick, clear }
}

function statusOf(photo: PickedPhoto | null, state: UploadState): PhotoStatus {
  if (state.phase === 'error') return 'error'
  if (state.phase === 'done') return 'ready'
  if (state.phase === 'compressing' || state.phase === 'uploading') return 'uploading'
  return photo ? 'uploading' : 'none'
}
