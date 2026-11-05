'use client'

import { useState } from 'react'

import type { Balance } from '@/core/billing/pools'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { startJob } from '../generation/job-store'
import { useJob, useJobs } from '../generation/use-jobs'
import { ctaState } from './cta-state'
import { FormAction } from './form-action'
import { GeneratingView } from './generating-view'
import { FailureView, SuccessView } from './settled-views'
import { missingRequiredCopy } from './text-fields'
import { UPLOAD_FORMATS } from './upload-formats'
import { usePhoto } from './use-photo'
import { WorkspaceForm, type FormValues } from './workspace-form'

export type WorkspaceProps = {
  template: CatalogueTemplate
  balance: Balance
  // From the server: the account's limit (core/jobs concurrencyLimit) and the jobs running at
  // render time, so photos started in another tab count too.
  concurrency: { limit: number; runningIds: string[] }
  shareText: string
}

const DEFAULTS: FormValues = { aspect: 'original', resolution: '1k', note: '', copy: {} }

// The workspace flow (DESIGN §4.3–4.4): form → developing → done or failed. The job lives in
// the generation store, so leaving this page does not stop it; Photos shows it.
export function ImageWorkspace({ template, balance, concurrency, shareText }: WorkspaceProps) {
  const photo = usePhoto()
  const [values, setValues] = useState(DEFAULTS)
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useJob(jobId)
  const running = useRunningCount(concurrency.runningIds)
  const cost = template.creditsCost[values.resolution]
  const state = ctaState({
    balance,
    cost,
    running,
    limit: concurrency.limit,
    photo: photo.status === 'ready' ? 'ready' : photo.status === 'uploading' ? 'uploading' : 'none',
    copyMissing: missingRequiredCopy(template.copyFields, values.copy),
  })

  const generate = () => {
    const note = values.note.trim()
    const id = startJob({
      templateId: template.id,
      templateName: template.name,
      resolution: values.resolution,
      aspect: values.aspect,
      credits: cost,
      inputKey: photo.inputKey,
      previewUrl: photo.photo?.url,
      body: {
        template_id: template.id,
        input_key: photo.inputKey,
        inputs: { copy: values.copy, aspect_ratio: values.aspect, resolution: values.resolution, ...(note ? { note } : {}) },
      },
    })
    setJobId(id)
    window.scrollTo({ top: 0 })
  }
  const backToForm = (clearPhoto: boolean) => {
    if (clearPhoto) photo.clear()
    setJobId(null)
  }

  if (job?.status === 'running') return <GeneratingView job={job} />
  if (job?.status === 'succeeded') return <SuccessView job={job} shareText={shareText} onAgain={() => backToForm(false)} />
  if (job?.status === 'failed') return <FailureView job={job} onRetry={generate} onNewPhoto={() => backToForm(true)} />
  return (
    <>
      <WorkspaceForm
        template={template}
        balance={balance}
        photo={photo}
        values={values}
        onChange={(next) => setValues((current) => ({ ...current, ...next }))}
        formats={UPLOAD_FORMATS}
      />
      <FormAction state={state} resolution={values.resolution} onGenerate={generate} />
    </>
  )
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
