'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { FlowNav } from '@/core/app-shell'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { TrackedJob } from '../generation/job-model'
import { useJobs, useWorkspaceJobs } from '../generation/use-jobs'
import { GeneratingView } from './generating-view'
import { isDeveloping, soleJob } from './pending-job'
import { recallTemplate, showPendingHead } from './pending-template'
import { WorkspaceHead } from './workspace-head'

// What the workspace route shows while the server is still reading the template, the balance
// and the tier (the page's Suspense fallback). Generate in the creation dialog, or on the home
// page, queues the photo in this tab's generation store and then moves here: the job is already
// known in the browser, so its developing view is drawn at once instead of after the server's
// answer (measured on the test site: 0.9–1.2 s from the click, of which about 0.4 s was an empty
// page). The head belongs to the workspace's one photo whatever became of it: a request refused
// at once (balance, price check, moderation) leaves the head in place and nothing under it until
// the server's page shows the failure, instead of a blank page in between. Without exactly one
// photo it is the empty nav row it always was, and so it is for ?again= and ?reuse=: those open
// the form, which only the server can fill.
export function WorkspacePending() {
  const t = useTranslations('app.workspace')
  const job = usePendingJob()
  // The head is the server's own when the click handed its template over (pending-template.ts):
  // then nothing moves when the server's page takes over.
  const template = job ? recallTemplate(job.templateId) : null
  // The server's head takes this one's place without fading in again (workspace-head.tsx).
  const headFor = job?.templateId
  useEffect(() => (headFor ? showPendingHead(headFor) : undefined), [headFor])
  return (
    <>
      <FlowNav back={{ href: '/generate', label: t('back') }} title={job?.templateName ?? ''} />
      {job ? <PendingBody job={job} template={template} /> : null}
    </>
  )
}

// The workspace's one photo, from this tab's store; none when the address opens the form.
function usePendingJob(): TrackedJob | null {
  const { templateId } = useParams<{ templateId?: string }>()
  const search = useSearchParams()
  const sole = soleJob(useWorkspaceJobs(templateId ?? ''), useJobs())
  return search.has('again') || search.has('reuse') ? null : sole
}

function PendingBody({ job, template }: { job: TrackedJob; template: CatalogueTemplate | null }) {
  return (
    <>
      {template ? <WorkspaceHead template={template} /> : <NameHead name={job.templateName} />}
      {isDeveloping(job) ? <GeneratingView job={job} /> : null}
    </>
  )
}

// Without the template: its name where WorkspaceHead draws it, in the room the thumbnail takes
// (70px inside the same padding).
function NameHead({ name }: { name: string }) {
  return (
    <div className="px-(--gutter) pt-2 pb-1 lg:pt-6">
      <div className="flex min-h-[70px] items-center">
        <h1 className="font-display text-title leading-none tracking-[-0.02em]">{name}</h1>
      </div>
    </div>
  )
}
