'use client'

import { useCallback, useState } from 'react'

import { trackUploadError } from '@/core/analytics/browser'
import { checkPickedFile, UploadError, uploadErrorReason, type UploadErrorCode } from '@/core/storage/upload'
import { usePhoto } from '../workspace/use-photo'
import type { HomePhotoStatus } from './home-cta'

export type HomePhoto = {
  url: string | null
  status: HomePhotoStatus
  error: UploadErrorCode | null
  // The picked file, kept for the sign-up draft; the R2 key once uploaded (signed in).
  file: File | null
  inputKey: string | null
  pick(file: File): void
}

// Signed in, a picked photo uploads at once through the workspace's own pipeline (compress →
// presigned PUT to R2, ARCHITECTURE §8.2). Signed out it stays in the browser: there is no
// account to upload to until the visitor signs up (DESIGN §6.9 item 9).
export function useHomePhoto(signedIn: boolean): HomePhoto {
  const uploader = usePhoto()
  const upload = uploader.pick
  const [file, setFile] = useState<File | null>(null)
  const [local, setLocal] = useState<string | null>(null)
  const [error, setError] = useState<UploadErrorCode | null>(null)

  const pick = useCallback(
    (next: File) => {
      try {
        checkPickedFile(next)
      } catch (failure) {
        setError(failure instanceof UploadError ? failure.code : 'UPLOAD_FAILED')
        // Refused at the picker (T74 upload_error); a signed-in pick that passes is counted by uploadPhoto.
        const reason = uploadErrorReason(failure, 'pick')
        if (reason) trackUploadError(reason)
        return
      }
      setError(null)
      setFile(next)
      if (signedIn) void upload(next)
      else setLocal(URL.createObjectURL(next))
    },
    [signedIn, upload],
  )

  if (signedIn) {
    const uploadError = uploader.upload.phase === 'error' ? uploader.upload.code : null
    return { url: uploader.photo?.url ?? null, status: error ? 'error' : uploader.status, error: error ?? uploadError, file, inputKey: uploader.inputKey, pick }
  }
  return { url: local, status: error ? 'error' : local ? 'ready' : 'none', error, file, inputKey: null, pick }
}
