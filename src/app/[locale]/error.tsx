'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { captureError } from '@/core/analytics/browser'
import { reportIfStaleBuild } from '@/core/app-update'
// Straight from its file, not the '@/core/content' index: this boundary is a client component in
// every route's bundle, and through the index it carried the marketing blocks (hero, template
// grid, photo pairs: two chunks, about 55 KB raw) into every signed-in page.
import { PROBLEM_GHOST, PROBLEM_PRIMARY, ProblemView } from '@/core/content/blocks/problem-view'
import { Link } from '@/core/i18n/ui'
import { site } from '@/site/site.config'

// An error inside a page: the root layout (and its messages) still stand, so the notice is in
// the page's language (design/comps-v3-b/404.html?v=error). In-app pages have their own
// error state inside the app shell. app/global-error.tsx only covers a failing root layout.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('pageError')
  useEffect(() => {
    captureError(error)
    // A chunk or Server Action of an older build: the new-version banner offers the reload (T90).
    reportIfStaleBuild(error)
  }, [error])
  return (
    <main className="flex flex-1 flex-col pb-16">
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
    </main>
  )
}
