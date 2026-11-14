'use client'

/* eslint-disable @next/next/no-img-element -- local previews and the finished photo route */
import { useTranslations } from 'next-intl'
import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { Link } from '@/core/i18n/ui'
import { thumbUrlFor } from '@/core/jobs/job-view'

import { ActionBar } from '@/core/app-shell'
import { buttonVariants } from '@/core/ui/button'

import { ZipButtonLazy as ZipButton } from '../batch/zip-button-lazy'
import type { TrackedJob } from '../generation/job-model'
import { BatchJobRow } from './batch-job-row'
import type { BatchTally } from './batch-tally'
import { Tick } from './photo-card'
import { useNow } from './use-now'
import { tierName } from './workspace-options'

type Props = { jobs: TrackedJob[]; tally: BatchTally; onRetry(id: string): void; onMakeMore(): void }

// A settled batch (B comp workspace.html?batch&state=done): how many were saved and what they
// cost, a grid of every photo (a failed one marked refunded), the failed ones again as rows
// with Retry, Make more and Download ZIP (T107) as ghosts, and Open Photos as the one primary.
export function BatchDone({ jobs, tally, onRetry, onMakeMore }: Props) {
  const t = useTranslations('app')
  const now = useNow()
  const failed = jobs.map((job, index) => ({ job, index: index + 1 })).filter(({ job }) => job.status === 'failed')
  const first = jobs[0]
  return (
    <>
      <div role="status" className="hairline-lit rounded-panel bg-card p-4">
        <h2 id="batch-h" className="flex items-center gap-2 text-body leading-[1.25] font-semibold">
          <Tick />
          {t('workspace.batch.savedTitle', { done: tally.done })}
        </h2>
        <p className="mt-1.5 text-caption leading-[1.4] text-muted-foreground">
          {t('workspace.batch.savedLine', { done: tally.done, count: tally.count, tier: first ? tierName(first.resolution, t) : '', credits: tally.creditsUsed, failed: tally.failed })}
        </p>
        <ul className="mt-3 grid grid-cols-5 gap-1.5 md:grid-cols-6 md:gap-2">
          {jobs.map((job, index) => (
            <li key={job.id}>
              <DoneTile job={job} index={index + 1} />
            </li>
          ))}
        </ul>
      </div>
      {failed.length > 0 ? (
        <ol className="hairline mt-3 rounded-tile bg-card px-3 py-1 [&>li+li]:border-t [&>li+li]:border-hairline">
          {failed.map(({ job, index }) => (
            <BatchJobRow key={job.id} job={job} index={index} now={now} onRetry={() => onRetry(job.id)} />
          ))}
        </ol>
      ) : null}
      <div className="mt-4 flex items-start gap-2">
        <button type="button" onClick={onMakeMore} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'flex-1' })}>
          {t('workspace.makeMore')}
        </button>
        {/* Preflighted batches only (T107); one sent before that has no batch id to pack. */}
        {first?.batchId && tally.done > 0 ? <ZipButton batchId={first.batchId} count={tally.done} className="flex-1" /> : null}
      </div>
      <ActionBar className="md:px-0">
        <Link href="/photos" className={buttonVariants({ variant: 'cta', size: 'cta' })}>
          {t('workspace.batch.openPhotos')}
        </Link>
      </ActionBar>
    </>
  )
}

function DoneTile({ job, index }: { job: TrackedJob; index: number }) {
  const t = useTranslations('app.workspace')
  const frame = 'relative block aspect-[4/5] overflow-hidden rounded-[10px] bg-muted'
  if (job.status === 'succeeded' && job.fileUrl) {
    return (
      <Link href={`/photos/${job.id}`} aria-label={t('photoN', { index })} className={`press ${frame}`}>
        <img src={thumbUrlFor(job.id)} alt="" width={480} height={600} loading="lazy" decoding="async" className={`${REPLAY_BLOCK_CLASS} absolute inset-0 size-full object-cover`} />
      </Link>
    )
  }
  return (
    <span className={frame}>
      {job.previewUrl ? <img src={job.previewUrl} alt="" className={`${REPLAY_BLOCK_CLASS} absolute inset-0 size-full object-cover`} /> : null}
      <span className="absolute inset-0 grid place-items-center bg-[var(--photo-fade)] text-center text-caption leading-tight font-medium text-foreground">{t('batch.refunded')}</span>
    </span>
  )
}
