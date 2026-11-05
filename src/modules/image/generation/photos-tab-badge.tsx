'use client'

import { useTranslations } from 'next-intl'

import { useJobs } from './use-jobs'

// Safelight count on the Photos tab while this tab's jobs run. 14px digits (TOKENS.md
// clean-up: nothing visible under 14px).
export function PhotosTabBadge() {
  const t = useTranslations('app.photos')
  const running = useJobs().filter((job) => job.status === 'running').length
  if (running === 0) return null
  return (
    <span
      aria-label={t('badgeAria', { count: running })}
      className="absolute top-1 left-[calc(50%+4px)] grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 font-mono text-caption leading-none font-medium text-primary-foreground md:static md:ml-1"
    >
      {running}
    </span>
  )
}
