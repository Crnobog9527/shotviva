'use client'

import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { FlowNav } from '@/core/app-shell'

import { useJobs, useWorkspaceJobs } from '../generation/use-jobs'
import { GeneratingView } from './generating-view'
import { developingJob } from './pending-job'

// What the workspace route shows while the server is still reading the template, the balance
// and the tier (the page's Suspense fallback). Generate in the creation dialog, or on the home
// page, queues the photo in this tab's generation store and then moves here: the job is already
// known in the browser, so its developing view is drawn at once instead of after the server's
// answer (measured on the test site: 0.9–1.2 s from the click, of which about 0.4 s was an empty
// page). With nothing developing it is the empty nav row it always was.
export function WorkspacePending() {
  const { templateId } = useParams<{ templateId?: string }>()
  const t = useTranslations('app.workspace')
  const ids = useWorkspaceJobs(templateId ?? '')
  const job = developingJob(ids, useJobs())
  return (
    <>
      <FlowNav back={{ href: '/generate', label: t('back') }} title={job?.templateName ?? ''} />
      {job ? (
        <>
          {/* The template's name where WorkspaceHead draws it, in the room its thumbnail takes
              (70px), so the developing view does not move when the head arrives. */}
          <div className="flex min-h-[70px] items-center px-(--gutter) pt-2 pb-1 lg:pt-6">
            <h1 className="font-display text-title leading-none tracking-[-0.02em]">{job.templateName}</h1>
          </div>
          <GeneratingView job={job} />
        </>
      ) : null}
    </>
  )
}
