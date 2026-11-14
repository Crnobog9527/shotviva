'use client'

import { useCallback, useState } from 'react'

import { track, trackUploadError } from '@/core/analytics/browser'
import { useUpdateHold } from '@/core/app-update'

import { compressImage, putWithProgress, requestTicket, UploadError, uploadPhoto, type UploadDeps, type UploadErrorCode, type UploadPhase } from '@/core/storage/upload'

export type UploadState =
  | { phase: 'idle' }
  | { phase: UploadPhase; progress: number }
  | { phase: 'done'; inputKey: string }
  | { phase: 'error'; code: UploadErrorCode; message: string }

export const uploadDeps: UploadDeps = {
  compress: compressImage,
  requestTicket,
  put: putWithProgress,
  track: (props) => track('upload', props),
  trackError: trackUploadError,
}

// Upload half of DESIGN §4.4 (Compressing → Uploading with progress); the Generating phase
// belongs to the generation hook. A failed upload restarts from scratch (§8.2: no resume).
export function useUpload() {
  const [state, setState] = useState<UploadState>({ phase: 'idle' })
  // No new-version banner mid-upload (T90).
  useUpdateHold('upload', state.phase === 'compressing' || state.phase === 'uploading')

  const upload = useCallback(async (file: File): Promise<string | null> => {
    try {
      const inputKey = await uploadPhoto(file, uploadDeps, {
        onPhase: (phase) => setState({ phase, progress: 0 }),
        onProgress: (progress) => setState({ phase: 'uploading', progress }),
      })
      setState({ phase: 'done', inputKey })
      return inputKey
    } catch (error) {
      const known = error instanceof UploadError
      setState({
        phase: 'error',
        code: known ? error.code : 'UPLOAD_FAILED',
        message: known ? error.message : 'Upload failed; please try again',
      })
      return null
    }
  }, [])

  const reset = useCallback(() => setState({ phase: 'idle' }), [])

  return { state, upload, reset }
}
