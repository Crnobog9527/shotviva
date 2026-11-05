'use client'

import { useFormatter, useTranslations } from 'next-intl'
/* eslint-disable @next/next/no-img-element -- local object URL of the picked photo */
import Link from 'next/link'
import type { ReactNode } from 'react'

import { ActionBar } from '@/core/app-shell'
import { buttonVariants } from '@/core/ui/button'

import type { TrackedJob } from '../generation/job-model'
import { estimatedProgress, percent } from '../generation/progress'
import { Tick } from './photo-card'
import { useNow } from './use-now'
import { tierName, tierPx } from './workspace-options'

// "Developing" (DESIGN §4.4, "Progress Card"): the photo as a greyed negative under a moving
// safelight scan line, then the three stages with a bar and a percentage. Leaving is fine.
export function GeneratingView({ job }: { job: TrackedJob }) {
  const now = useNow()
  const fraction = estimatedProgress(now - job.startedAt)
  const t = useTranslations('app')
  const format = useFormatter()
  return (
    <section aria-labelledby="gen-h" className="px-4 pt-2">
      <h2 id="gen-h" className="sr-only">{t('workspace.developingTitle')}</h2>
      <div className="hairline animate-develop relative aspect-[5/4] overflow-hidden rounded-panel bg-photo-ground">
        {job.previewUrl ? (
          <>
            <img src={job.previewUrl} alt="" className="absolute inset-0 size-full object-cover brightness-[.7] contrast-[.85] grayscale" />
            <img src={job.previewUrl} alt="" className="absolute inset-0 size-full object-cover [clip-path:inset(0_0_var(--left)_0)]" />
          </>
        ) : null}
        <span aria-hidden="true" className="absolute inset-x-0 top-[calc(100%-var(--left))] -mt-px h-0.5 bg-primary" />
        <span className="absolute inset-x-4 top-4 z-2 flex justify-between">
          <Pill>{t('workspace.developing')}</Pill>
          <Pill>
            {t.rich('workspace.developingSize', { tier: tierName(job.resolution, t), px: tierPx(job.resolution), mono: (chunks) => <span className="font-mono">{chunks}</span> })}
          </Pill>
        </span>
      </div>
      <ol className="hairline mt-4 rounded-tile bg-card px-4 py-1 [&>li+li]:border-t [&>li+li]:border-hairline">
        <Stage label={t('workspace.compressing')} done />
        <Stage label={t('workspace.uploading')} done />
        <li className="flex min-h-13 items-center gap-3 text-body">
          <span aria-hidden="true" className="grid size-[22px] flex-none place-items-center rounded-full bg-safelight-tint">
            <span className="animate-dot size-2 rounded-full bg-primary" />
          </span>
          {t('workspace.generating')}
          <span role="progressbar" aria-label={t('workspace.generating')} aria-valuenow={percent(fraction)} aria-valuemin={0} aria-valuemax={100} className="ml-1 h-1 flex-1 overflow-hidden rounded-full bg-wash-strong">
            <span className="block h-full rounded-full bg-primary transition-[width] duration-1000" style={{ width: `${percent(fraction)}%` }} />
          </span>
          <span className="font-mono text-caption leading-none text-muted-foreground">{format.number(fraction, { style: 'percent', maximumFractionDigits: 0 })}</span>
        </li>
      </ol>
      <p className="mt-4 text-caption text-bone-dim">{t('workspace.leave')}</p>
      <ActionBar>
        <Link href="/generate" className={buttonVariants({ variant: 'glass', size: 'cta', className: 'w-full rounded-control' })}>
          {t('workspace.backToCreate')}
        </Link>
      </ActionBar>
    </section>
  )
}

function Stage({ label, done }: { label: string; done: boolean }) {
  return (
    <li className="flex min-h-13 items-center gap-3 text-body">
      {done ? <Tick /> : null}
      {label}
    </li>
  )
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="frost inline-flex min-h-7 items-center gap-1 rounded-full px-3 text-caption leading-none font-medium text-photo-ink">{children}</span>
}
