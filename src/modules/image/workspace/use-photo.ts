'use client'

import { useCallback, useState } from 'react'

import { useUpload, type UploadState } from './use-upload'

export type PickedPhoto = { url: string; bytes: number }
export type PhotoStatus = 'none' | 'uploading' | 'ready' | 'error'

// The workspace photo: uploads as soon as it is picked (Compressing → Uploading), so Generate
// only has to send the key. The object URL is the on-screen preview; it is kept for the tab's
// life because a running job may still show it.
export function usePhoto() {
  const { state, upload, reset } = useUpload()
  const [photo, setPhoto] = useState<PickedPhoto | null>(null)

  const pick = useCallback(
    async (file: File) => {
      setPhoto({ url: URL.createObjectURL(file), bytes: file.size })
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

// "3.2 MB"
export const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
