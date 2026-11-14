'use client'

import { useFormatter, useTranslations } from 'next-intl'

import type { TrackedJob } from '../generation/job-model'
import { etaProgress } from '../generation/eta'
import { useEta } from '../generation/eta-store'
import { percent } from '../generation/progress'
import { Tick } from './photo-card'
import { useNow } from './use-now'

// The steps of a photo developing (B comp workspace.html / photo.html .steps): the finished ones
// ticked, then Generating (or waiting for a slot) with an estimated bar and a percentage. A
// template photo lists Compressing and Uploading; an edit only Request sent (nothing uploads).
export function DevelopSteps({ job, done }: { job: TrackedJob; done: string[] }) {
  const now = useNow()
  const t = useTranslations('app')
  const format = useFormatter()
  const waiting = job.status === 'queued'
  const eta = useEta(job)
  const fraction = waiting ? 0 : etaProgress(now - job.startedAt, eta)
  return (
    <ol className="hairline rounded-tile bg-card px-4 py-1 [&>li+li]:border-t [&>li+li]:border-hairline">
      {done.map((label) => (
        <li key={label} className="flex min-h-13 items-center gap-3 text-body">
          <Tick />
          {label}
        </li>
      ))}
      <li className="flex min-h-13 items-center gap-3 text-body">
        <span aria-hidden="true" className="grid size-[22px] flex-none place-items-center rounded-full bg-safelight-tint">
          <span className="size-2 rounded-full bg-primary" />
        </span>
        {t(waiting ? 'workspace.waitingSlot' : 'workspace.generating')}
        <span role="progressbar" aria-label={t('workspace.generating')} aria-valuenow={percent(fraction)} aria-valuemin={0} aria-valuemax={100} className="ml-1 h-1 flex-1 overflow-hidden rounded-full bg-wash-strong">
          <span className="block h-full rounded-full bg-primary transition-[width] duration-1000" style={{ width: `${percent(fraction)}%` }} />
        </span>
        <span className="font-mono text-caption leading-none text-muted-foreground">{format.number(fraction, { style: 'percent', maximumFractionDigits: 0 })}</span>
      </li>
    </ol>
  )
}
