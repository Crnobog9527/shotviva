'use client'

import type { Balance } from '@/core/billing/pools'
import type { MembershipTier } from '@/core/config'
import { useReveal } from '@/core/ui/reveal'

import { useBatchRefusal } from '../batch/use-batch-refusal'
import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { retryJob, setWorkspaceJobs } from '../generation/job-store'
import { useWorkspaceJobs } from '../generation/use-jobs'
import { MatrixAction } from './matrix-action'
import { MatrixForm, MatrixHead, MatrixStage } from './matrix-form'
import { MatrixLocked } from './matrix-locked'
import { MatrixResults } from './matrix-results'
import { onlyTemplate } from './matrix-state'
import { MATRIX_VIEW, useMatrixDraft } from './use-matrix-draft'

export type MatrixWorkspaceProps = {
  templates: CatalogueTemplate[]
  initial: string[]
  balance: Balance
  tier: MembershipTier | null
  limit: number
}

// Several templates × several photos (T107, Max only): the form, then the batch's results by
// template or by photo. Below Max the page shows what it does with a locked Max badge and opens
// the paywall on Max (a Max feature stays visible, ARCHITECTURE §6.2 / T107).
export function MatrixWorkspace(props: MatrixWorkspaceProps) {
  if (props.tier !== 'max') return <MatrixLocked />
  return <MaxMatrix {...props} />
}

function MaxMatrix({ templates, initial, balance, limit }: MatrixWorkspaceProps) {
  const draft = useMatrixDraft({ templates, initial, balance, limit })
  const ids = useWorkspaceJobs(MATRIX_VIEW)
  const refusal = useBatchRefusal()
  const reveal = useReveal<HTMLDivElement>()
  const generate = () => {
    void draft.start().then((error) => {
      if (error) refusal.handle(error)
      else window.scrollTo({ top: 0 })
    })
  }
  const back = () => setWorkspaceJobs(MATRIX_VIEW, [])
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
        <MatrixHead />
        <MatrixForm draft={draft} templates={templates} balancePaid={balance.paid} />
        <MatrixAction cta={draft.cta} error={refusal.message(draft.error)} onGenerate={generate} />
      </div>
      <MatrixStage draft={draft} />
    </div>
  )
}
