'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/core/i18n/ui'

import { ActionBar } from '@/core/app-shell'
import { buttonVariants } from '@/core/ui/button'

import type { TrackedJob } from '../generation/job-model'
import { isActive } from '../generation/scheduler'
import { useJobs } from '../generation/use-jobs'
import { BatchJobRow } from './batch-job-row'
import { useNow } from './use-now'

type Props = { ids: readonly string[]; onRetry(id: string): void; onMakeMore(): void }

// "Developing" for a batch (T28, DESIGN §4.4): one panel, a row per photo in pick order, each
// with its own state. Leaving is fine: the queue lives in the generation store. Once every
// photo has settled the one primary is See in Photos.
export function BatchProgressView({ ids, onRetry, onMakeMore }: Props) {
  const t = useTranslations('app.workspace')
  const now = useNow()
  const byId = new Map(useJobs().map((job) => [job.id, job]))
  const jobs = ids.map((id) => byId.get(id)).filter((job): job is TrackedJob => job !== undefined)
  const settled = !jobs.some(isActive)
  const done = jobs.filter((job) => job.status === 'succeeded').length
  const failed = jobs.filter((job) => job.status === 'failed').length
  return (
    <section aria-labelledby="batch-h" className="px-4 pt-2">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="batch-h" className="text-headline leading-[1.2] font-semibold tracking-[-0.01em]">
          {t(settled ? 'batchSettledTitle' : 'batchTitle', { count: jobs.length })}
        </h2>
        <span aria-live="polite" className="text-caption text-muted-foreground">
          {t('batchSummary', { done, failed, count: jobs.length })}
        </span>
      </div>
      <ul className="hairline rounded-tile bg-card px-3 [&>li+li]:border-t [&>li+li]:border-hairline">
        {jobs.map((job, index) => (
          <BatchJobRow key={job.id} job={job} index={index + 1} now={now} onRetry={() => onRetry(job.id)} />
        ))}
      </ul>
      {settled ? (
        <div className="mt-4 flex">
          <button type="button" onClick={onMakeMore} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'flex-1' })}>
            {t('makeMore')}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-caption text-bone-dim">{t('batchLeave')}</p>
      )}
      <ActionBar>
        {settled ? (
          <Link href="/photos" className={buttonVariants({ variant: 'cta', size: 'cta' })}>
            {t('seeInPhotos')}
          </Link>
        ) : (
          <Link href="/generate" className={buttonVariants({ variant: 'glass', size: 'cta', className: 'w-full rounded-control' })}>
            {t('backToCreate')}
          </Link>
        )}
      </ActionBar>
    </section>
  )
}
