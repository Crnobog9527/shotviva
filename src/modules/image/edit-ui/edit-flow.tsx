'use client'

import { useTranslations } from 'next-intl'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import type { Balance } from '@/core/billing/pools'
import { useRouter } from '@/core/i18n'
import { EDIT_TEMPLATE_ID } from '@/core/templates/edit-params'
import type { CreditsCost } from '@/core/templates/pricing'
import { navTypesFor } from '@/core/ui/nav-motion'

import { retryJob, startJob } from '../generation/job-store'
import { useJob } from '../generation/use-jobs'
import { EDIT_QUERY } from './edit-link'
import { EditDeveloping, EditFailure } from './edit-states'
import { EditPanel } from './edit-panel'
import type { EditDraft, EditSource } from './edit-source'

const OpenEdit = createContext<(() => void) | null>(null)

// The Edit button reads this; null outside an EditFlow (editing off, or not the owner's photo).
export const useOpenEdit = () => useContext(OpenEdit)

type Props = {
  source: EditSource
  balance: Balance
  creditsCost: CreditsCost
  concurrency: number
  // Opened by "Edit this photo" on the workspace's done view (edit-link.ts): the panel starts open.
  openOnLoad?: boolean
  children: ReactNode
}

// A photo edit from the detail page (ARCHITECTURE §5.2, T6 comp photo.html): panel → developing
// → the new photo's own page, or the failure with Retry and "Change the request". The job runs
// in the generation store like any other, so leaving the page does not stop it.
export function EditFlow({ source, balance, creditsCost, concurrency, openOnLoad = false, children }: Props) {
  const t = useTranslations('app.edit')
  const router = useRouter()
  const [open, setOpen] = useState(openOnLoad)
  const [draft, setDraft] = useState<EditDraft>({ text: '', resolution: source.resolution, aspect: source.aspect })
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useJob(jobId)

  useEffect(() => {
    // Once open, drop ?edit=1 so a refresh or Back to this page does not open the panel again.
    if (openOnLoad) dropEditQuery()
  }, [openOnLoad])

  useEffect(() => {
    if (job?.status === 'succeeded') router.push(`/photos/${job.id}`, { transitionTypes: navTypesFor(`/photos/${job.id}`) })
  }, [job?.status, job?.id, router])

  const generate = (next: EditDraft) => {
    setOpen(false)
    const id = startJob(
      {
        templateId: EDIT_TEMPLATE_ID,
        templateName: t('titleEdited', { name: source.name }),
        resolution: next.resolution,
        aspect: next.aspect,
        credits: creditsCost[next.resolution],
        inputKey: null,
        previewUrl: source.fileUrl,
        body: { source_job_id: source.id, instruction: next.text, resolution: next.resolution, aspect_ratio: next.aspect },
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

  if (job && (job.status === 'queued' || job.status === 'running')) return <EditDeveloping job={job} source={source} />
  if (job?.status === 'failed') {
    return <EditFailure job={job} source={source} onRetry={() => setJobId(retryJob(job.id, concurrency))} onChange={changeRequest} />
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

function dropEditQuery() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(EDIT_QUERY)) return
  url.searchParams.delete(EDIT_QUERY)
  window.history.replaceState(window.history.state, '', url)
}
