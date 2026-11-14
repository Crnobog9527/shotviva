'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/core/i18n/ui'

import { ActionBar } from '@/core/app-shell'
import { buttonVariants } from '@/core/ui/button'

import type { TrackedJob } from '../generation/job-model'
import { DevelopTray, StageLayout, TRAY_SIZE } from './develop-tray'
import { DevelopSteps } from './develop-steps'
import { NotifyButton } from '../generation/notify-button'
import { WaitNote } from './wait-note'
import { tierName, tierPx } from './workspace-options'

// "Developing" (DESIGN §4.4, B comp workspace.html?state=generating): the photo coming up in the
// developer on the tray, then the three stages with a bar and a percentage. Leaving is fine.
// A photo still queued (the account's other photos hold every slot) waits at 0%. An edit has
// its own view on the photo page (edit-ui/edit-states.tsx).
export function GeneratingView({ job }: { job: TrackedJob }) {
  const waiting = job.status === 'queued'
  const t = useTranslations('app')
  const size = t.rich('workspace.developingSize', { tier: tierName(job.resolution, t), px: tierPx(job.resolution, job.aspect), mono: (chunks) => <span className="font-mono">{chunks}</span> })
  return (
    <StageLayout labelledBy="gen-h" tray={<DevelopTray src={job.previewUrl ?? null} developing={!waiting} hud={[t(waiting ? 'workspace.waiting' : 'workspace.developing'), size]} className={TRAY_SIZE} />}>
      <h2 id="gen-h" className="sr-only">{t('workspace.developingTitle')}</h2>
      <DevelopSteps job={job} done={[t('workspace.compressing'), t('workspace.uploading')]} />
      <WaitNote job={job} />
      <NotifyButton />
      <ActionBar className="md:px-0">
        <Link href="/generate" className={buttonVariants({ variant: 'glass', size: 'cta', className: 'w-full rounded-control' })}>
          {t('workspace.backToCreate')}
        </Link>
      </ActionBar>
    </StageLayout>
  )
}
