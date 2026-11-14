'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { captureError } from '@/core/analytics/browser'
import { reportIfStaleBuild } from '@/core/app-update'
// Straight from its file, not the '@/core/content' index: through the index it would carry the
// marketing blocks (hero, template grid, photo pairs) into every bundle that has this boundary.
import { PROBLEM_GHOST, PROBLEM_PRIMARY, ProblemView } from '@/core/content/blocks/problem-view'
import { Link } from '@/core/i18n/ui'
import { site } from '@/site/site.config'

export type PageErrorProps = { error: Error & { digest?: string }; reset: () => void }

// Reports the error once: to Sentry, and to the new-version banner when it is a chunk or Server
// Action of an older build (T90).
export function useReportPageError(error: PageErrorProps['error']) {
  useEffect(() => {
    captureError(error)
    reportIfStaleBuild(error)
  }, [error])
}

// The page-error panel (design/comps-v3-b/404.html?v=error), in the page's language. Rendered
// by the marketing and sign-in groups' error boundaries inside their own layouts, so the site's
// header, footer and stylesheets are already there and this boundary brings none of its own.
export function PageErrorView({ error, reset }: PageErrorProps) {
  const t = useTranslations('pageError')
  useReportPageError(error)
  return (
    <div className="flex flex-1 flex-col pb-16">
      <ProblemView
        code="500"
        heading={{ lead: t('heading'), emphasis: t('headingEm') }}
        body={t('body', { email: site.brand.contactEmail })}
        actions={
          <>
            <button type="button" onClick={reset} className={PROBLEM_PRIMARY}>
              {t('retry')}
            </button>
            <Link href="/" className={PROBLEM_GHOST}>
              {t('home')}
            </Link>
          </>
        }
      />
    </div>
  )
}
