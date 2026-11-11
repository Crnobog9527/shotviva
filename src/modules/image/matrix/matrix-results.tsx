'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { ActionBar } from '@/core/app-shell'
import { Link } from '@/core/i18n/ui'
import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { ZipButton } from '../batch/zip-button'
import type { TrackedJob } from '../generation/job-model'
import { useJobs } from '../generation/use-jobs'
import { batchTally } from '../workspace/batch-tally'
import { photoNumbers, resultGroups, type ResultGroup, type ResultView } from './result-groups'
import { ResultTile } from './result-tile'

type Props = { ids: readonly string[]; onRetry(id: string): void; onApply(templateId: string): void; onNew(): void }

// The multi-template batch after Generate (T107): where it stands, the results by template or
// by photo, and once settled its ZIP. Each template group offers "Use on more photos", the form
// again with only that template and its text kept. Leaving is fine: the jobs live in the store.
export function MatrixResults({ ids, onRetry, onApply, onNew }: Props) {
  const t = useTranslations('app.matrix')
  const [view, setView] = useState<ResultView>('template')
  const byId = new Map(useJobs().map((job) => [job.id, job]))
  const jobs = ids.map((id) => byId.get(id)).filter((job): job is TrackedJob => job !== undefined)
  const tally = batchTally(jobs)
  const numbers = photoNumbers(jobs)
  const batchId = jobs[0]?.batchId
  return (
    <section aria-labelledby="matrix-results-h" className="px-(--gutter) pt-4 lg:px-0">
      <div role="status" className="hairline-lit rounded-panel bg-card p-4">
        <h2 id="matrix-results-h" className="text-body leading-[1.25] font-semibold">
          {tally.settled ? t('resultsDone', { done: tally.done, count: tally.count }) : t('resultsRunning', { done: tally.done, count: tally.count })}
        </h2>
        <p className="mt-1.5 text-caption leading-[1.4] text-muted-foreground">{t('resultsLine', { credits: tally.creditsUsed, failed: tally.failed, queued: tally.queued + tally.developing })}</p>
        {tally.settled && batchId && tally.done > 0 ? <ZipButton batchId={batchId} count={tally.done} className="mt-3" /> : null}
      </div>
      <ViewSwitch view={view} onChange={setView} />
      <div className="mt-2 grid gap-5">
        {resultGroups(jobs, view).map((group) => (
          <Group key={group.key} group={group} view={view} numbers={numbers} onRetry={onRetry} onApply={onApply} />
        ))}
      </div>
      <div className="mt-5 flex">
        <button type="button" onClick={onNew} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'flex-1' })}>
          {t('newBatch')}
        </button>
      </div>
      <ActionBar className="md:px-0">
        <Link href={tally.settled ? '/photos' : '/generate'} className={buttonVariants({ variant: tally.settled ? 'cta' : 'glass', size: 'cta', className: tally.settled ? undefined : 'w-full rounded-control' })}>
          {t(tally.settled ? 'openPhotos' : 'backToCreate')}
        </Link>
      </ActionBar>
    </section>
  )
}

function ViewSwitch({ view, onChange }: { view: ResultView; onChange(next: ResultView): void }) {
  const t = useTranslations('app.matrix')
  return (
    <div role="group" aria-label={t('viewLabel')} className="hairline mt-4 grid grid-cols-2 gap-1 rounded-full bg-wash p-1">
      {(['template', 'photo'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={view === option}
          onClick={() => onChange(option)}
          className={cn('press min-h-10 rounded-full text-label font-semibold transition-colors', view === option ? 'bg-foreground text-background' : 'text-bone-dim')}
        >
          {t(option === 'template' ? 'byTemplate' : 'byPhoto')}
        </button>
      ))}
    </div>
  )
}

type GroupProps = { group: ResultGroup; view: ResultView; numbers: Map<string, number>; onRetry(id: string): void; onApply(templateId: string): void }

function Group({ group, view, numbers, onRetry, onApply }: GroupProps) {
  const t = useTranslations('app.matrix')
  const title = view === 'template' ? group.title : t('photoN', { index: group.photoIndex ?? 0 })
  return (
    <section aria-label={title}>
      <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
        <h3 className="min-w-0 truncate text-body leading-[1.25] font-semibold">{title}</h3>
        {group.templateId ? (
          <button type="button" onClick={() => onApply(group.templateId!)} className="press -my-1 inline-flex min-h-11 flex-none items-center gap-1 text-caption font-medium text-foreground hover:underline hover:underline-offset-3">
            {t('applyMore')}
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        ) : null}
      </div>
      <ul className="grid grid-cols-3 gap-2 md:grid-cols-5">
        {group.jobs.map((job) => (
          <li key={job.id}>
            <ResultTile job={job} label={view === 'template' ? t('photoN', { index: numbers.get(job.id) ?? 0 }) : job.templateName} onRetry={() => onRetry(job.id)} />
          </li>
        ))}
      </ul>
    </section>
  )
}
