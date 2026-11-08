'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { captureError } from '@/core/analytics/browser'
import { reportIfStaleBuild } from '@/core/app-update'
import { EmptyState, STATE_GHOST } from '@/core/ui/empty-state'
import { site } from '@/site/site.config'

// A page inside the app failed to load (design/comps-v3-b/empty.html?v=error): the error
// state inside the app shell, so the tab bar and the way back stay. Failed generations are
// not this; they live in the workspace.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('app.states.error')
  useEffect(() => {
    captureError(error)
    // A chunk or Server Action of an older build: the new-version banner offers the reload (T90).
    reportIfStaleBuild(error)
  }, [error])
  const email = site.brand.contactEmail
  return (
    <EmptyState
      tone="error"
      icon="error"
      title={t('title')}
      body={t('body')}
      action={
        <button type="button" onClick={reset} className={STATE_GHOST}>
          {t('retry')}
        </button>
      }
      more={
        <a href={`mailto:${email}`} className="inline-flex min-h-11 items-center hover:text-foreground hover:underline">
          {t('more', { email })}
        </a>
      }
    />
  )
}
