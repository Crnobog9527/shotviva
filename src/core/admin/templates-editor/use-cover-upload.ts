'use client'

import { useState, useTransition } from 'react'

import { coverFileProblem, MAX_COVER_VIDEO_SECONDS, type CoverPurpose } from '../covers/cover-rules'
import type { ApplyCoverRequest, TemplateAdminActions } from '../templates/types'

import { putToStorage, readVideo } from './cover-browser'

export type CoverSlot = 'before' | 'after' | 'motion'
type CoverActions = Pick<TemplateAdminActions, 'requestCoverUpload' | 'applyCover'>

class UploadProblem extends Error {}

async function stage(actions: CoverActions, templateId: string, purpose: CoverPurpose, body: Blob): Promise<string> {
  const ticket = await actions.requestCoverUpload({ templateId, purpose, contentType: body.type, size: body.size })
  if (!ticket.ok) throw new UploadProblem(ticket.message)
  await putToStorage(ticket.value, body)
  return ticket.value.key
}

// Video: checked for length here (the server checks again from the MP4 header) and its first
// frame uploaded as the poster.
async function stageMotion(actions: CoverActions, templateId: string, file: File): Promise<ApplyCoverRequest> {
  if (file.type !== 'video/mp4') return { templateId, slot: 'motion', key: await stage(actions, templateId, 'motion', file) }
  const { seconds, poster } = await readVideo(file)
  if (seconds > MAX_COVER_VIDEO_SECONDS) throw new UploadProblem(`视频不能超过 ${MAX_COVER_VIDEO_SECONDS} 秒`)
  const key = await stage(actions, templateId, 'motion', file)
  return { templateId, slot: 'motion', key, posterKey: await stage(actions, templateId, 'poster', poster) }
}

// One cover operation at a time: browser checks → presigned PUT → server conversion + publish.
export function useCoverUpload(templateId: string, actions: CoverActions) {
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<CoverSlot | 'clear' | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const run = (slot: CoverSlot | 'clear', work: () => Promise<ApplyCoverRequest>) => {
    setBusy(slot)
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await actions.applyCover(await work())
        setMessage(result.ok ? { ok: true, text: '封面已更新，首页下次打开即生效' } : { ok: false, text: result.message })
      } catch (error) {
        setMessage({ ok: false, text: error instanceof UploadProblem ? error.message : '上传失败，请重试' })
      } finally {
        setBusy(null)
      }
    })
  }

  const upload = (slot: CoverSlot, file: File) => {
    const problem = coverFileProblem(slot, file)
    if (problem) return setMessage({ ok: false, text: problem })
    run(slot, async () =>
      slot === 'motion'
        ? stageMotion(actions, templateId, file)
        : { templateId, slot, key: await stage(actions, templateId, slot, file) },
    )
  }

  const clearMotion = () => run('clear', async () => ({ templateId, slot: 'clear-motion' }))

  return { pending, busy, message, upload, clearMotion }
}
