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
export type PhotoError = 'upload' | 'failed' | 'rateLimited' | null
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

  async function pick(file: File) {
    setError(null)
    setPending(null)
    setStage(null)
    setPhase('uploading')
    const inputKey = await uploadPhoto(file, uploadDeps, { onPhase: () => undefined, onProgress: () => undefined }).catch(() => null)
    if (!inputKey) {
      setPhase('idle')
      return setError('upload')
    }
    setPhase('reading')
    const reply = await extractPosterPhoto(template.id, inputKey, setStage)
    setPhase('idle')
    if (reply.status !== 'ok') return setError(reply.status === 'error' && reply.code === 'RATE_LIMITED' ? 'rateLimited' : 'failed')
    const found = { content: posterContentSchema.parse(reply.content), unverified: reply.unverified, text: reply.text ?? '' }
    if (dirty()) setPending(found)
    else apply(found)
  }

  return { phase, stage, error, pending, pick, confirm: () => pending && apply(pending), discard: () => setPending(null), busy: phase !== 'idle' }
}

export type PhotoSort = ReturnType<typeof usePhotoSort>
