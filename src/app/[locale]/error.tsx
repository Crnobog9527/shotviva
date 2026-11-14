'use client'

import { useTranslations } from 'next-intl'

import { Link } from '@/core/i18n/ui'
import { site } from '@/site/site.config'

import { useReportPageError, type PageErrorProps } from './page-error-view'

// Only for a crash inside a group's own layout (marketing, sign-in, app): page errors are caught
// by each group's error.tsx inside its layout. Here only the root layout stands, which carries no
// stylesheet, and this boundary imports none on purpose: with inlineCss every page would carry
// a copy of it in its HTML. So it is plain text that reads on an unstyled page. A failing root
// layout is app/global-error.tsx.
export default function PageError({ error, reset }: PageErrorProps) {
  const t = useTranslations('pageError')
  useReportPageError(error)
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '64px 16px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 28, margin: '0 0 12px' }}>
        {t('heading')} {t('headingEm')}
      </h1>
      <p>{t('body', { email: site.brand.contactEmail })}</p>
      <p>
        <button type="button" onClick={reset}>
          {t('retry')}
        </button>{' '}
        <Link href="/">{t('home')}</Link>
      </p>
    </main>
  )
}
