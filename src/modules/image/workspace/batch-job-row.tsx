'use client'

/* eslint-disable @next/next/no-img-element -- local previews and the finished photo route */
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'

import { PaywallButton } from '@/core/billing/paywall'
import { cn } from '@/core/ui/cn'

import type { TrackedJob } from '../generation/job-model'
import { estimatedProgress, percent } from '../generation/progress'
import { canRetry, failureReason, refundLine } from './error-copy'
import { Tick } from './photo-card'

const pill = 'press hairline inline-flex min-h-9 items-center rounded-full bg-wash px-4 text-caption font-semibold'

// One photo of a developing batch (T28): its thumbnail, where it is (waiting for a slot,
// generating with the estimated bar, done, or why it failed), and what to do next.
export function BatchJobRow({ job, index, now, onRetry }: { job: TrackedJob; index: number; now: number; onRetry(): void }) {
  const t = useTranslations('app')
  const done = job.status === 'succeeded'
  const body = (
    <>
      <Thumb job={job} />
      <span className="min-w-0 flex-1">
        <b className="block text-body leading-[1.25] font-semibold">{t('workspace.photoN', { index })}</b>
        <Status job={job} now={now} />
      </span>
      {done ? <Chevron /> : null}
      {job.status === 'failed' ? <FailedAction job={job} onRetry={onRetry} /> : null}
    </>
  )
  if (done) {
    return (
      <li>
        <Link href={`/photos/${job.id}`} className="press flex min-h-[76px] items-center gap-3 py-3">
          {body}
        </Link>
      </li>
    )
  }
  return <li className="flex min-h-[76px] items-center gap-3 py-3">{body}</li>
}

function Thumb({ job }: { job: TrackedJob }) {
  const developing = job.status === 'queued' || job.status === 'running'
  const src = job.status === 'succeeded' ? (job.fileUrl ?? job.previewUrl) : job.previewUrl
  return (
    <span className="relative block aspect-[4/5] w-12 flex-none overflow-hidden rounded-inner bg-photo-ground">
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" className={cn('absolute inset-0 size-full object-cover', developing && 'brightness-75 grayscale', job.status === 'failed' && 'opacity-60')} />
      ) : null}
      {job.status === 'running' ? <span aria-hidden="true" className="animate-scan absolute inset-x-0 top-[40%] h-0.5 bg-primary" /> : null}
    </span>
  )
}

function Status({ job, now }: { job: TrackedJob; now: number }) {
  const t = useTranslations('app')
  const errors = useTranslations('app.errors')
  const tiers = useTranslations('paywall.tiers')
  const format = useFormatter()
  if (job.status === 'queued') return <Line dot="bg-muted-foreground">{t('workspace.waitingSlot')}</Line>
  if (job.status === 'succeeded') {
    return (
      <span className="mt-1 flex items-center gap-2 text-caption">
        <Tick />
        {t('workspace.statusDone')}
      </span>
    )
  }
  if (job.status === 'failed') {
    const failure = job.failure ?? { code: 'INTERNAL', message: '', refunded: null }
    const tier = failure.requiredTier ? tiers(failure.requiredTier) : ''
    return (
      <span role="alert" className="mt-1 block text-caption leading-[1.35] text-bone-dim">
        {failureReason(failure, errors, { tier })} {refundLine(failure, errors)}
      </span>
    )
  }
  const fraction = estimatedProgress(now - job.startedAt)
  return (
    <span className="mt-2 flex items-center gap-2">
      <span
        role="progressbar"
        aria-label={t('workspace.generating')}
        aria-valuenow={percent(fraction)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1 flex-1 overflow-hidden rounded-full bg-wash-strong"
      >
        <span className="block h-full rounded-full bg-primary transition-[width] duration-1000" style={{ width: `${percent(fraction)}%` }} />
      </span>
      <span className="font-mono text-caption leading-none text-muted-foreground">{format.number(fraction, { style: 'percent', maximumFractionDigits: 0 })}</span>
    </span>
  )
}

function Line({ dot, children }: { dot: string; children: string }) {
  return (
    <span className="mt-1 flex items-center gap-2 text-caption text-muted-foreground">
      <span aria-hidden="true" className={cn('size-2 flex-none rounded-full', dot)} />
      {children}
    </span>
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

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] flex-none text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}
