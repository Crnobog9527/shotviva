'use client'

import { useState } from 'react'

import type { Balance } from '@/core/billing/pools'

import { useBatchRefusal } from '../batch/use-batch-refusal'
import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { BatchCaps } from '../gated/feature-access'
import { retryJob, setWorkspaceJobs } from '../generation/job-store'
import { useWorkspaceJobs } from '../generation/use-jobs'
import { createSubmitLatch } from '../workspace/submit-latch'
import { onlyTemplate } from './matrix-state'
import { submitBatch } from './submit-batch'
import { MATRIX_VIEW, useMatrixDraft } from './use-matrix-draft'

type Input = { templates: readonly CatalogueTemplate[]; initial: string[]; balance: Balance; limit: number; caps: BatchCaps; onStarted(): void }

// One Batch create, whichever frame shows it (the dialog on Create, or the /generate/batch
// page): the draft, its results in the generation store (MATRIX_VIEW, so a refresh lands on
// them), Generate behind the #515 latch, and the ways back to the form.
export function useBatchSession({ templates, initial, balance, limit, caps, onStarted }: Input) {
  const draft = useMatrixDraft({ templates, initial, balance, limit, caps })
  const ids = useWorkspaceJobs(MATRIX_VIEW)
  const refusal = useBatchRefusal()
  const [latch] = useState(createSubmitLatch)
  const back = () => {
    latch.reset()
    setWorkspaceJobs(MATRIX_VIEW, [])
  }
  return {
    draft,
    ids,
    refusal,
    generate: () => void submitBatch(latch, draft.start, { refused: refusal.handle, started: onStarted }),
    retry: (id: string) => void retryJob(id, limit),
    newBatch: () => {
      draft.photos.clear()
      back()
    },
    applyMore: (templateId: string) => {
      draft.photos.clear()
      draft.setValues((current) => onlyTemplate(current, templateId))
      back()
    },
  }
}

export type BatchSession = ReturnType<typeof useBatchSession>
