'use client'

import { useEffect } from 'react'

import { trackTemplateView } from '@/core/analytics/browser'
import { useReveal } from '@/core/ui/reveal'

import type { TrackedJob } from '../generation/job-model'
import { retryJob, setWorkspaceJobs } from '../generation/job-store'
import { useJob, useWorkspaceJobs } from '../generation/use-jobs'
import { BatchProgressView } from './batch-progress-view'
import { FormAction } from './form-action'
import { GeneratingView } from './generating-view'
import { FailureView, SuccessView } from './settled-views'
import { useWorkspaceDraft, type DraftInput } from './use-workspace-draft'
import { WorkspaceForm } from './workspace-form'
import { WorkspaceStage } from './workspace-stage'

// editable: editing is on (T30), so the done view offers "Edit this photo".
export type WorkspaceProps = DraftInput & { shareText: string; editable: boolean }

// The workspace page, the full-page form of the creation dialog (T38, DESIGN §6.9 item 2): form
// → developing → done or failed. One photo keeps the single-photo views; a batch (T28, Pro and
// Max) develops as a list. The jobs live in the generation store, so leaving this page does not
// stop them; Photos shows them. Which jobs this workspace shows lives there too, so a browser
// refresh, or Generate in the dialog, lands on the developing view or result, not the form.
// From lg up the form is the left column and the stage the right (B comp workspace.html).
export function ImageWorkspace({ shareText, editable, ...input }: WorkspaceProps) {
  const { template, tier, balance, concurrency } = input
  const draft = useWorkspaceDraft(input)
  const jobIds = useWorkspaceJobs(template.id)
  const single = useJob(jobIds.length === 1 ? (jobIds[0] ?? null) : null)
  const reveal = useReveal<HTMLDivElement>()
  // template_view (T74, ARCHITECTURE §16.2): once per template the workspace opens on.
  const { id: templateId, category } = template
  useEffect(() => trackTemplateView({ id: templateId, category }, 'workspace'), [templateId, category])

  const generate = () => {
    draft.start()
    window.scrollTo({ top: 0 })
  }
  // retryJob puts the new job where the failed one was in this workspace's list.
  const retry = (id: string) => void retryJob(id, concurrency.limit)
  const backToForm = (clearPhotos: boolean) => {
    if (clearPhotos) draft.photos.clear()
    setWorkspaceJobs(template.id, [])
  }

  if (jobIds.length > 1) return <BatchProgressView ids={jobIds} limit={concurrency.limit} onRetry={retry} onMakeMore={() => backToForm(true)} />
  if (single && (single.status === 'queued' || single.status === 'running')) return <GeneratingView job={single} />
  if (single) return <SingleJobView job={single} shareText={shareText} editable={editable} onRetry={() => retry(single.id)} onBack={backToForm} />
  return (
    <div className="lg:grid lg:grid-cols-[minmax(380px,440px)_minmax(0,1fr)] lg:items-start lg:gap-x-12 lg:px-(--gutter)">
      <div ref={reveal} className="min-w-0 px-(--gutter) lg:px-0">
        <WorkspaceForm template={template} balance={balance} tier={tier} photos={draft.photos} values={draft.values} onChange={draft.change} again={input.again} />
        <FormAction
          state={draft.state}
          resolution={draft.values.resolution}
          batch={draft.photos.batchMax > 1}
          addFirst={draft.missingPhoto ? template.creditsCost[draft.values.resolution] : null}
          limit={concurrency.limit}
          onGenerate={generate}
        />
      </div>
      <WorkspaceStage template={template} photo={draft.photos.photos[0] ?? null} />
    </div>
  )
}

type SingleProps = { job: TrackedJob; shareText: string; editable: boolean; onRetry(): void; onBack(clearPhotos: boolean): void }

// One photo, settled: done or failed (DESIGN §4.4).
function SingleJobView({ job, shareText, editable, onRetry, onBack }: SingleProps) {
  if (job.status === 'succeeded') return <SuccessView job={job} shareText={shareText} editable={editable} onAgain={() => onBack(false)} />
  return <FailureView job={job} onRetry={onRetry} onNewPhoto={() => onBack(true)} />
}
