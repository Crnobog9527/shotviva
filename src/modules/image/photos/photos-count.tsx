'use client'

import { useTranslations } from 'next-intl'

import { useJobs } from '../generation/use-jobs'

// "2 in progress · 4 done" beside the Photos title, counting this tab's own jobs too.
export function PhotosCount({ runningIds, done }: { runningIds: string[]; done: number }) {
  const t = useTranslations('app.photos')
  const ids = new Set(runningIds)
  for (const job of useJobs()) {
    if (job.status === 'running') ids.add(job.id)
    else ids.delete(job.id)
  }
  return (
    <span className="text-caption text-muted-foreground">{t('count', { running: ids.size, done })}</span>
  )
}
