'use client'

import { useState } from 'react'

import type { Balance } from '@/core/billing/pools'
import type { MembershipTier } from '@/core/config'
import { useReveal } from '@/core/ui/reveal'

import { useBatchRefusal } from '../batch/use-batch-refusal'
import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { batchCaps, type BatchCaps } from '../gated/feature-access'
import { retryJob, setWorkspaceJobs } from '../generation/job-store'
import { useWorkspaceJobs } from '../generation/use-jobs'
import { createSubmitLatch } from '../workspace/submit-latch'
import { MatrixAction } from './matrix-action'
import { MatrixForm, MatrixHead, MatrixStage } from './matrix-form'
import { MatrixLocked } from './matrix-locked'
import { MatrixResults } from './matrix-results'
import { onlyTemplate } from './matrix-state'
import { submitBatch } from './submit-batch'
import { MATRIX_VIEW, useMatrixDraft } from './use-matrix-draft'

export type MatrixWorkspaceProps = {
  templates: CatalogueTemplate[]
  initial: string[]
  balance: Balance
  tier: MembershipTier | null
  limit: number
}

// Batch create (Owner 2026-11-12): one form for both ways. One template on many photos is a
// batch; two to five templates make a grid. The plan sets how much one batch holds (Pro one
// template on up to 10 photos, Max up to five templates and 30 in all, an admin counts as Max).
// Below Pro the page shows what it does and the plan that unlocks it. After Generate: the
// batch's results, by template or by photo, and its ZIP.
export function MatrixWorkspace(props: MatrixWorkspaceProps) {
  const caps = batchCaps(props.tier)
  if (!caps) return <MatrixLocked tier={props.tier} />
  return <BatchForm {...props} caps={caps} />
}

function BatchForm({ templates, initial, balance, tier, limit, caps }: MatrixWorkspaceProps & { caps: BatchCaps }) {
  const draft = useMatrixDraft({ templates, initial, balance, limit, caps })
  const ids = useWorkspaceJobs(MATRIX_VIEW)
  const refusal = useBatchRefusal()
  const reveal = useReveal<HTMLDivElement>()
  const [latch] = useState(createSubmitLatch)
  const generate = () => {
    submitBatch(latch, draft.start, { refused: refusal.handle, started: () => window.scrollTo({ top: 0 }) })
  }
  const back = () => {
    latch.reset()
    setWorkspaceJobs(MATRIX_VIEW, [])
  }
  if (ids.length > 0) {
    return (
      <MatrixResults
        ids={ids}
        onRetry={(id) => void retryJob(id, limit)}
        onNew={() => {
          draft.photos.clear()
          back()
        }}
        onApply={(templateId) => {
          draft.photos.clear()
          draft.setValues((current) => onlyTemplate(current, templateId))
          back()
        }}
      />
    )
  }
  return (
    <div className="lg:grid lg:grid-cols-[minmax(380px,440px)_minmax(0,1fr)] lg:items-start lg:gap-x-12 lg:px-(--gutter)">
      <div ref={reveal} className="min-w-0 px-(--gutter) lg:px-0">
        <MatrixHead caps={caps} />
        <MatrixForm draft={draft} templates={templates} balancePaid={balance.paid} tier={tier} />
        <MatrixAction cta={draft.cta} max={caps.cells} error={refusal.message(draft.error)} onGenerate={generate} />
      </div>
      <MatrixStage draft={draft} />
    </div>
  )
}
