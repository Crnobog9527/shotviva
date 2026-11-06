'use client'

import { useState } from 'react'

import type { Balance } from '@/core/billing/pools'
import { limitsFor } from '@/core/billing/tier-limits'
import type { MembershipTier } from '@/core/config'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { TrackedJob } from '../generation/job-model'
import { enqueueJobs, retryJob } from '../generation/job-store'
import { useJob, useJobs } from '../generation/use-jobs'
import { BatchProgressView } from './batch-progress-view'
import { startInputs } from './batch-request'
import { ctaState } from './cta-state'
import { FormAction } from './form-action'
import { GeneratingView } from './generating-view'
import { FailureView, SuccessView } from './settled-views'
import { missingRequiredCopy } from './text-fields'
import { usePhotoBatch } from './use-photo-batch'
import { WorkspaceForm, type FormValues } from './workspace-form'

export type WorkspaceProps = {
  template: CatalogueTemplate
  balance: Balance
  // current_tier() from the server: decides batchMax (TIER_LIMITS); null is Starter.
  tier: MembershipTier | null
  // From the server: the account's concurrency (TIER_LIMITS) and the jobs running at render
  // time, so photos started in another tab count too.
  concurrency: { limit: number; runningIds: string[] }
  shareText: string
}

const DEFAULTS: FormValues = { aspect: 'original', resolution: '1k', note: '', copy: {} }

// The workspace flow (DESIGN §4.3–4.4): form → developing → done or failed. One photo keeps the
// single-photo views; a batch (T28, Pro and Max) develops as a list. The jobs live in the
// generation store, so leaving this page does not stop them; Photos shows them.
export function ImageWorkspace({ template, balance, tier, concurrency, shareText }: WorkspaceProps) {
  const photos = usePhotoBatch(limitsFor(tier).batchMax)
  const [values, setValues] = useState(DEFAULTS)
  const [jobIds, setJobIds] = useState<string[]>([])
  const single = useJob(jobIds.length === 1 ? (jobIds[0] ?? null) : null)
  const running = useRunningCount(concurrency.runningIds)
  const { summary } = photos
  const state = ctaState({
    balance,
    cost: template.creditsCost[values.resolution],
    running,
    limit: concurrency.limit,
    photo: summary.photo,
    count: summary.planned,
    copyMissing: missingRequiredCopy(template.copyFields, values.copy),
  })

  const generate = () => {
    setJobIds(enqueueJobs(startInputs(template, values, summary.ready), concurrency.limit))
    window.scrollTo({ top: 0 })
  }
  const retry = (id: string) => {
    const next = retryJob(id, concurrency.limit)
    if (next) setJobIds((ids) => ids.map((current) => (current === id ? next : current)))
  }
  const backToForm = (clearPhotos: boolean) => {
    if (clearPhotos) photos.clear()
    setJobIds([])
  }

  if (jobIds.length > 1) return <BatchProgressView ids={jobIds} onRetry={retry} onMakeMore={() => backToForm(true)} />
  if (single) return <SingleJobView job={single} shareText={shareText} onRetry={() => retry(single.id)} onBack={backToForm} />
  return (
    <>
      <WorkspaceForm
        template={template}
        balance={balance}
        tier={tier}
        photos={photos}
        values={values}
        onChange={(next) => setValues((current) => ({ ...current, ...next }))}
      />
      <FormAction state={state} resolution={values.resolution} batch={photos.batchMax > 1} onGenerate={generate} />
    </>
  )
}

type SingleProps = { job: TrackedJob; shareText: string; onRetry(): void; onBack(clearPhotos: boolean): void }

// One photo: developing (or waiting for a slot), then done or failed (DESIGN §4.4).
function SingleJobView({ job, shareText, onRetry, onBack }: SingleProps) {
  if (job.status === 'succeeded') return <SuccessView job={job} shareText={shareText} onAgain={() => onBack(false)} />
  if (job.status === 'failed') return <FailureView job={job} onRetry={onRetry} onNewPhoto={() => onBack(true)} />
  return <GeneratingView job={job} />
}

// Running photos for the concurrency check: the server's list at render plus this tab's own.
// A job this tab saw settle may still be in the server's (older) list, so it is taken out.
function useRunningCount(serverIds: string[]): number {
  const ids = new Set(serverIds)
  for (const job of useJobs()) {
    if (job.status === 'running') ids.add(job.id)
    else ids.delete(job.id)
  }
  return ids.size
}
