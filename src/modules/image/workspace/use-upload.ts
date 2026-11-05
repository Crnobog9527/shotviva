'use client'

import { useCallback, useState } from 'react'

import { compressImage } from './compress-image'
import { putWithProgress } from './put-with-progress'
import { requestTicket } from './request-ticket'
import { UploadError, uploadPhoto, type UploadErrorCode, type UploadPhase } from './upload-photo'

export type UploadState =
  | { phase: 'idle' }
  | { phase: UploadPhase; progress: number }
  | { phase: 'done'; inputKey: string }
  | { phase: 'error'; code: UploadErrorCode; message: string }

const deps = { compress: compressImage, requestTicket, put: putWithProgress }

// Upload half of DESIGN §4.4 (Compressing → Uploading with progress); the Generating phase
// belongs to the generation hook. A failed upload restarts from scratch (§8.2: no resume).
export function useUpload() {
  const [state, setState] = useState<UploadState>({ phase: 'idle' })

  const upload = useCallback(async (file: File): Promise<string | null> => {
    try {
      const inputKey = await uploadPhoto(file, deps, {
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
