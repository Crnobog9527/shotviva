'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { captureError } from '@/core/analytics/browser'
import { buttonVariants } from '@/core/ui/button'

// An error inside a page: the root layout (and its messages) still stand, so the notice is in
// the page's language. app/global-error.tsx only covers a failing root layout.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('pageError')
  useEffect(() => captureError(error), [error])
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p className="max-w-sm text-muted-foreground">{t('body')}</p>
      <button type="button" onClick={reset} className={buttonVariants({ size: 'touch' })}>
        {t('retry')}
      </button>
    </main>
  )
}
