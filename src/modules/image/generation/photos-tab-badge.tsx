'use client'

import { useTranslations } from 'next-intl'

import { isActive } from './scheduler'
import { useJobs } from './use-jobs'

// Safelight count on the Photos tab while this tab's jobs run. 14px digits (TOKENS.md
// clean-up: nothing visible under 14px).
export function PhotosTabBadge() {
  const t = useTranslations('app.photos')
  // Queued batch photos count: they are on their way (T28).
  const running = useJobs().filter(isActive).length
  if (running === 0) return null
  return (
    <span
      aria-label={t('badgeAria', { count: running })}
      className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 font-mono text-caption leading-none font-medium text-primary-foreground max-md:absolute max-md:top-1 max-md:left-[calc(50%+4px)] md:ml-1"
    >
      {running}
    </span>
  )
}
