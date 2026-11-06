'use client'

/* eslint-disable @next/next/no-img-element -- local previews and the finished photo route */
import { useFormatter, useTranslations } from 'next-intl'
import { Link } from '@/core/i18n/ui'

import { PaywallButton } from '@/core/billing/paywall'
import { cn } from '@/core/ui/cn'

import type { TrackedJob } from '../generation/job-model'
import { estimatedProgress, percent } from '../generation/progress'
import { canRetry, failureReason, refundLine } from './error-copy'

const pill = 'press hairline inline-flex min-h-9 items-center rounded-full bg-wash px-3 text-caption font-semibold'

// One photo of a developing batch (T28, B comp workspace.html?batch&state=generating): its
// thumbnail, where it is (queued, developing with the estimated bar, saved, or failed and
// refunded), and on the right its credits or what to do next. A saved one opens its photo.
export function BatchJobRow({ job, index, now, onRetry }: { job: TrackedJob; index: number; now: number; onRetry(): void }) {
  const t = useTranslations('app')
  const done = job.status === 'succeeded'
  const body = (
    <>
      <Thumb job={job} />
      <span className="min-w-0">
        <span className="sr-only">{t('workspace.photoN', { index })}: </span>
        <Status job={job} now={now} />
      </span>
      {done ? <span className="font-mono text-caption text-muted-foreground">{t('credits', { count: job.credits })}</span> : null}
      {job.status === 'failed' ? <FailedAction job={job} onRetry={onRetry} /> : null}
      {job.status === 'queued' || job.status === 'running' ? <span /> : null}
    </>
  )
  const row = 'grid min-h-14 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 py-1.5'
  if (done) {
    return (
      <li>
        <Link href={`/photos/${job.id}`} className={cn('press', row)}>
          {body}
        </Link>
      </li>
    )
  }
  return <li className={cn(row, job.status === 'running' && 'font-medium')}>{body}</li>
}

function Thumb({ job }: { job: TrackedJob }) {
  const src = job.status === 'succeeded' ? (job.fileUrl ?? job.previewUrl) : job.previewUrl
  return (
    <span className="relative block h-[50px] w-10 overflow-hidden rounded-[8px] bg-photo-ground">
      {src ? <img src={src} alt="" loading="lazy" decoding="async" className={cn('absolute inset-0 size-full object-cover', job.status === 'failed' && 'opacity-60')} /> : null}
    </span>
  )
}

function Status({ job, now }: { job: TrackedJob; now: number }) {
  const t = useTranslations('app')
  const errors = useTranslations('app.errors')
  const tiers = useTranslations('paywall.tiers')
  const format = useFormatter()
  if (job.status === 'queued') return <span className="font-mono text-caption text-muted-foreground">{t('workspace.batch.rowQueued')}</span>
  if (job.status === 'succeeded') {
    return (
      <span className="inline-flex items-center gap-1.5 text-label text-success">
        <Check />
        {t('workspace.batch.rowSaved')}
      </span>
    )
  }
  if (job.status === 'failed') {
    const failure = job.failure ?? { code: 'INTERNAL', message: '', refunded: null }
    const tier = failure.requiredTier ? tiers(failure.requiredTier) : ''
    return (
      <span role="alert" className="block">
        <span className="inline-flex items-center gap-1.5 text-label text-destructive">
          <Alert />
          {failure.refunded === true ? t('workspace.batch.rowFailed', { count: job.credits }) : refundLine(failure, errors)}
        </span>
        <span className="block text-caption leading-[1.35] text-muted-foreground">{failureReason(failure, errors, { tier })}</span>
      </span>
    )
  }
  const fraction = estimatedProgress(now - job.startedAt)
  return (
    <span className="flex items-center gap-2 text-label">
      {t('workspace.developing')}
      <span role="progressbar" aria-label={t('workspace.generating')} aria-valuenow={percent(fraction)} aria-valuemin={0} aria-valuemax={100} className="h-1 max-w-40 flex-1 overflow-hidden rounded-full bg-wash-strong">
        <span className="block h-full rounded-full bg-primary transition-[width] duration-1000" style={{ width: `${percent(fraction)}%` }} />
      </span>
      <span className="font-mono text-caption leading-none text-muted-foreground">{format.number(fraction, { style: 'percent', maximumFractionDigits: 0 })}</span>
    </span>
  )
}

const icon = { viewBox: '0 0 24 24', 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function Check() {
  return (
    <svg {...icon} className="size-3.5 flex-none" strokeWidth={3}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function Alert() {
  return (
    <svg {...icon} className="size-3.5 flex-none" strokeWidth={2.4}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  )
}

// Retry for a failure the same photo can get past; for TIER_REQUIRED, the plan that allows it.
function FailedAction({ job, onRetry }: { job: TrackedJob; onRetry(): void }) {
  const t = useTranslations('app.workspace')
  const tiers = useTranslations('paywall.tiers')
  const failure = job.failure
  if (failure?.requiredTier) {
    return (
      <PaywallButton trigger="tier_required" options={{ step: 'period', tier: failure.requiredTier }} className={pill}>
        {t('getTier', { tier: tiers(failure.requiredTier) })}
      </PaywallButton>
    )
  }
  if (!failure || !canRetry(failure) || !job.body) return null
  return (
    <button type="button" onClick={onRetry} className={pill}>
      {t('retry')}
    </button>
  )
}
