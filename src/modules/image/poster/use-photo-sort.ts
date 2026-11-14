'use client'

import { useState } from 'react'

import { posterContentSchema, type PosterBlock, type PosterContent } from '@/core/poster'
import { uploadPhoto } from '@/core/storage/upload'

import { uploadDeps } from '../workspace/use-upload'
import { extractPosterPhoto } from './poster-api'
import type { PosterStudioState, StudioTemplate } from './use-poster-studio'

// 拍照识别 (§5.3「每周复用」): pick a photo or screenshot of an old poster → upload it like any
// photo → the server reads and sorts it → the editor opens on the blocks. When the editor already
// holds the user's own words, the result waits for a yes before it replaces them.

export type PhotoPhase = 'idle' | 'uploading' | 'reading'
// failed: unreadable or the model failed, the run's credits given back (refunded).
export type PhotoError = 'upload' | 'failed' | 'rateLimited' | 'credits' | 'unavailable' | null
// The route's limit (run-extract-photo.ts PHOTOS_MAX): a set's pages, at most 4.
const PHOTOS_MAX = 4
type Found = { content: PosterContent; unverified: string[]; text: string }

export function usePhotoSort(template: Pick<StudioTemplate, 'id'>, studio: PosterStudioState, dirty: () => boolean) {
  const [phase, setPhase] = useState<PhotoPhase>('idle')
  const [stage, setStage] = useState<PosterBlock | null>(null)
  const [error, setError] = useState<PhotoError>(null)
  const [pending, setPending] = useState<Found | null>(null)

  const apply = (found: Found) => {
    setPending(null)
    studio.startFrom(found.content, { source: 'photo' }, { unverified: found.unverified, source: found.text })
  }

  // One photo per page of the set; any more are left out.
  async function pick(files: readonly File[]) {
    setError(null)
    setPending(null)
    setStage(null)
    setPhase('uploading')
    const upload = (file: File) => uploadPhoto(file, uploadDeps, { onPhase: () => undefined, onProgress: () => undefined }).catch(() => null)
    const keys = await Promise.all(files.slice(0, PHOTOS_MAX).map(upload))
    if (keys.length === 0 || keys.some((key) => key === null)) {
      setPhase('idle')
      return setError('upload')
    }
    setPhase('reading')
    const reply = await extractPosterPhoto(template.id, keys as string[], setStage)
    setPhase('idle')
    if (reply.status !== 'ok') return setError(photoError(reply))
    const found = { content: posterContentSchema.parse(reply.content), unverified: reply.unverified, text: reply.text ?? '' }
    if (dirty()) setPending(found)
    else apply(found)
  }

  return { phase, stage, error, pending, pick, confirm: () => pending && apply(pending), discard: () => setPending(null), busy: phase !== 'idle' }
}

export type PhotoSort = ReturnType<typeof usePhotoSort>

const ERROR_CODES: Record<string, PhotoError> = { RATE_LIMITED: 'rateLimited', CREDITS_INSUFFICIENT: 'credits' }

// What a run that gave no text shows: never charged (credits, limit, off) or refunded (failed).
function photoError(reply: { status: string; code?: string }): PhotoError {
  if (reply.status === 'unavailable') return 'unavailable'
  if (reply.status === 'error') return ERROR_CODES[reply.code ?? ''] ?? 'failed'
  return 'failed'
}
