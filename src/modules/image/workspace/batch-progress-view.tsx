'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/core/i18n/ui'

import { ActionBar } from '@/core/app-shell'
import { buttonVariants } from '@/core/ui/button'

import { roundedSeconds } from '../generation/eta'
import { NotifyButton } from '../generation/notify-button'
import { useEta } from '../generation/eta-store'
import type { TrackedJob } from '../generation/job-model'
import { useJobs } from '../generation/use-jobs'
import { BatchDone } from './batch-done'
import { BatchJobRow } from './batch-job-row'
import { batchTally, trayPhoto, type BatchTally } from './batch-tally'
import { DevelopTray, StageLayout, TRAY_SIZE } from './develop-tray'
import { useNow } from './use-now'
import { tierName, tierPx } from './workspace-options'

type Props = { ids: readonly string[]; limit: number; onRetry(id: string): void; onMakeMore(): void }

// A batch after Generate (T28, B comp workspace.html?batch): while it develops, the summary,
// one row per photo in pick order and the tray developing the photo in flight; once every photo
// has settled, what was saved (BatchDone). Leaving is fine: the queue lives in the generation
// store.
export function BatchProgressView({ ids, limit, onRetry, onMakeMore }: Props) {
  const byId = new Map(useJobs().map((job) => [job.id, job]))
  const jobs = ids.map((id) => byId.get(id)).filter((job): job is TrackedJob => job !== undefined)
  const tally = batchTally(jobs)
  return (
    <StageLayout labelledBy="batch-h" tray={<BatchTray jobs={jobs} tally={tally} />}>
      {tally.settled ? <BatchDone jobs={jobs} tally={tally} onRetry={onRetry} onMakeMore={onMakeMore} /> : <Running jobs={jobs} tally={tally} limit={limit} onRetry={onRetry} />}
    </StageLayout>
  )
}

// The tray develops the photo in flight ("Developing 4 of 6"); settled, it shows the first
// saved result ("5 of 6 done").
function BatchTray({ jobs, tally }: { jobs: TrackedJob[]; tally: BatchTally }) {
  const t = useTranslations('app')
  const first = jobs[0]
  const hud = tally.settled
    ? t('workspace.batch.hudDone', { done: tally.done, count: tally.count })
    : t(tally.current ? 'workspace.batch.hudDeveloping' : 'workspace.waiting', { index: tally.current ?? 0, count: tally.count })
  const size = first ? t.rich('workspace.developingSize', { tier: tierName(first.resolution, t), px: tierPx(first.resolution, first.aspect), mono: (chunks) => <span className="font-mono">{chunks}</span> }) : null
  return <DevelopTray src={trayPhoto(jobs, tally)} developing={tally.current !== null} hud={[<span key="hud" className="tabular-nums">{hud}</span>, size]} className={TRAY_SIZE} />
}

function Running({ jobs, tally, limit, onRetry }: { jobs: TrackedJob[]; tally: BatchTally; limit: number; onRetry(id: string): void }) {
  const t = useTranslations('app.workspace')
  const now = useNow()
  // Every photo of a batch shares its template's size; a multi-template batch reads the first.
  const eta = useEta(jobs[0])
  const wait = useTranslations('app.wait')
  const notify = useTranslations('app.notify')
  return (
    <>
      <h2 id="batch-h" className="sr-only">{t('batchTitle', { count: tally.count })}</h2>
      <p aria-live="polite" className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-caption text-muted-foreground">
        <b className="font-medium text-foreground">{t('batch.sum', { done: tally.done, count: tally.count })}</b>
        <span>{t('batch.counts', { developing: tally.developing, queued: tally.queued, failed: tally.failed })}</span>
      </p>
      <ol className="hairline rounded-tile bg-card px-3 py-1 [&>li+li]:border-t [&>li+li]:border-hairline">
        {jobs.map((job, index) => (
          <BatchJobRow key={job.id} job={job} index={index + 1} now={now} onRetry={() => onRetry(job.id)} />
        ))}
      </ol>
      <p className="mt-3 text-caption text-bone-dim">{eta ? wait('batchLeave', { count: limit, seconds: roundedSeconds(eta.p50Ms) }) : t('batch.leave', { count: limit })}</p>
      {tally.queued > 0 ? <p className="mt-1 text-caption text-bone-dim">{notify('leaveQueued')}</p> : null}
      <NotifyButton />
      <ActionBar className="md:px-0">
        <Link href="/generate" className={buttonVariants({ variant: 'glass', size: 'cta', className: 'w-full rounded-control' })}>
          {t('backToCreate')}
        </Link>
      </ActionBar>
    </>
  )
}
