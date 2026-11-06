'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { Link } from '@/core/i18n/ui'

import { ActionBar } from '@/core/app-shell'
import { buttonVariants } from '@/core/ui/button'

import type { TrackedJob } from '../generation/job-model'
import { estimatedProgress, percent } from '../generation/progress'
import { DevelopTray, StageLayout, TRAY_SIZE } from './develop-tray'
import { Tick } from './photo-card'
import { useNow } from './use-now'
import { tierName, tierPx } from './workspace-options'

// "Developing" (DESIGN §4.4, B comp workspace.html?state=generating): the photo coming up in the
// developer on the tray, then the three stages with a bar and a percentage. Leaving is fine.
// A photo still queued (the account's other photos hold every slot) waits at 0%. The photo
// page's edit flow uses the same view.
export function GeneratingView({ job }: { job: TrackedJob }) {
  const now = useNow()
  const waiting = job.status === 'queued'
  const fraction = waiting ? 0 : estimatedProgress(now - job.startedAt)
  const t = useTranslations('app')
  const format = useFormatter()
  const size = t.rich('workspace.developingSize', { tier: tierName(job.resolution, t), px: tierPx(job.resolution), mono: (chunks) => <span className="font-mono">{chunks}</span> })
  return (
    <StageLayout labelledBy="gen-h" tray={<DevelopTray src={job.previewUrl ?? null} developing={!waiting} hud={[t(waiting ? 'workspace.waiting' : 'workspace.developing'), size]} className={TRAY_SIZE} />}>
      <h2 id="gen-h" className="sr-only">{t('workspace.developingTitle')}</h2>
      <ol className="hairline rounded-tile bg-card px-4 py-1 [&>li+li]:border-t [&>li+li]:border-hairline">
        <Stage label={t('workspace.compressing')} />
        <Stage label={t('workspace.uploading')} />
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
      <p className="mt-4 text-caption text-bone-dim">{t('workspace.leave')}</p>
      <ActionBar className="md:px-0">
        <Link href="/generate" className={buttonVariants({ variant: 'glass', size: 'cta', className: 'w-full rounded-control' })}>
          {t('workspace.backToCreate')}
        </Link>
      </ActionBar>
    </StageLayout>
  )
}

function Stage({ label }: { label: string }) {
  return (
    <li className="flex min-h-13 items-center gap-3 text-body">
      <Tick />
      {label}
    </li>
  )
}
