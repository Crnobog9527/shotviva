'use client'

import { useTranslations } from 'next-intl'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import type { Balance } from '@/core/billing/pools'
import { useRouter } from '@/core/i18n'
import { EDIT_TEMPLATE_ID } from '@/core/templates/edit-params'
import type { CreditsCost } from '@/core/templates/pricing'

import { retryJob, startJob } from '../generation/job-store'
import { useJob } from '../generation/use-jobs'
import { GeneratingView } from '../workspace/generating-view'
import { EditFailure } from './edit-failure'
import { EditPanel } from './edit-panel'
import type { EditDraft, EditSource } from './edit-source'

const OpenEdit = createContext<(() => void) | null>(null)

// The Edit button reads this; null outside an EditFlow (editing off, or not the owner's photo).
export const useOpenEdit = () => useContext(OpenEdit)

type Props = { source: EditSource; balance: Balance; creditsCost: CreditsCost; concurrency: number; children: ReactNode }

// A photo edit from the detail page (ARCHITECTURE §5.2, T6 comp photo.html): panel → developing
// → the new photo's own page, or the failure with Retry and "Change the request". The job runs
// in the generation store like any other, so leaving the page does not stop it.
export function EditFlow({ source, balance, creditsCost, concurrency, children }: Props) {
  const t = useTranslations('app.edit')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<EditDraft>({ text: '', resolution: source.resolution })
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useJob(jobId)

  useEffect(() => {
    if (job?.status === 'succeeded') router.push(`/photos/${job.id}`)
  }, [job?.status, job?.id, router])

  const generate = (next: EditDraft) => {
    setOpen(false)
    const id = startJob(
      {
        templateId: EDIT_TEMPLATE_ID,
        templateName: t('titleEdited', { name: source.name }),
        resolution: next.resolution,
        aspect: source.aspect,
        credits: creditsCost[next.resolution],
        inputKey: null,
        previewUrl: source.fileUrl,
        body: { source_job_id: source.id, instruction: next.text, resolution: next.resolution },
      },
      concurrency,
    )
    setJobId(id)
    window.scrollTo({ top: 0 })
  }
  const changeRequest = () => {
    setJobId(null)
    setOpen(true)
  }

  if (job && (job.status === 'queued' || job.status === 'running')) return <GeneratingView job={job} />
  if (job?.status === 'failed') {
    return <EditFailure job={job} onRetry={() => setJobId(retryJob(job.id, concurrency))} onChange={changeRequest} />
  }
  return (
    <OpenEdit.Provider value={() => setOpen(true)}>
      {children}
      <EditPanel
        open={open}
        onOpenChange={setOpen}
        source={source}
        balance={balance}
        creditsCost={creditsCost}
        draft={draft}
        onDraft={(next) => setDraft((current) => ({ ...current, ...next }))}
        onGenerate={generate}
      />
    </OpenEdit.Provider>
  )
}
