'use client'

/* eslint-disable @next/next/no-img-element -- local previews and the finished photo route */
import { useTranslations } from 'next-intl'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { Link } from '@/core/i18n/ui'
import { cn } from '@/core/ui/cn'

import type { TrackedJob } from '../generation/job-model'
import { canRetry } from '../workspace/error-copy'

const FRAME = 'relative block aspect-[4/5] overflow-hidden rounded-[10px] bg-muted'

// One cell of the batch's results (T107): the finished photo (opens it), or the picked photo
// greyed under where it stands: queued, developing, refunded with Retry.
export function ResultTile({ job, label, onRetry }: { job: TrackedJob; label: string; onRetry(): void }) {
  const t = useTranslations('app.matrix')
  const done = job.status === 'succeeded' && job.fileUrl
  return (
    <div className="min-w-0">
      {done ? (
        <Link href={`/photos/${job.id}`} className={cn('press hairline', FRAME)}>
          <img src={job.fileUrl!} alt={label} loading="lazy" decoding="async" className={cn(REPLAY_BLOCK_CLASS, 'absolute inset-0 size-full object-cover')} />
        </Link>
      ) : (
        <span className={FRAME}>
          {job.previewUrl ? <img src={job.previewUrl} alt="" className={cn(REPLAY_BLOCK_CLASS, 'absolute inset-0 size-full object-cover grayscale-[.6] brightness-[.55]')} /> : null}
          <span className="absolute inset-x-0 bottom-0 grid gap-1 p-1.5 text-center text-caption leading-tight font-medium text-foreground">
            {job.status === 'running' ? <span aria-hidden="true" className="mx-auto h-1 w-3/4 overflow-hidden rounded-full bg-wash-strong"><span className="block h-full w-1/2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" /></span> : null}
            <span>{t(job.status === 'running' ? 'tileDeveloping' : job.status === 'queued' ? 'tileQueued' : 'tileRefunded')}</span>
          </span>
        </span>
      )}
      <span className="mt-1 block truncate text-caption leading-tight text-muted-foreground">{label}</span>
      {job.status === 'failed' && job.failure && canRetry(job.failure) ? (
        <button type="button" onClick={onRetry} className="press -my-1 inline-flex min-h-11 items-center text-caption font-semibold text-primary">
          {t('retry')}
        </button>
      ) : null}
    </div>
  )
}
