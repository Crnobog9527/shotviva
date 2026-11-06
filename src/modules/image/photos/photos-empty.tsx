'use client'

import { Link } from '@/core/i18n/ui'
import { useTranslations } from 'next-intl'

import { EmptyState, STATE_PRIMARY } from '@/core/ui/empty-state'

import { useJobs } from '../generation/use-jobs'

// Empty Photos (DESIGN §4.6, design/comps-v3-b/empty.html): the first row of cards ghosts
// through behind the plate, one line and the page's one primary. Hidden while this tab has a
// photo developing that the server list did not include yet.
export function PhotosEmpty() {
  const t = useTranslations('app.photos')
  const developing = useJobs().some((job) => job.status === 'running')
  if (developing) return null
  return (
    <EmptyState
      ghost
      title={t('emptyTitle')}
      body={t('empty')}
      action={
        <Link href="/generate" className={STATE_PRIMARY}>
          {t('emptyCta')}
        </Link>
      }
    />
  )
}
