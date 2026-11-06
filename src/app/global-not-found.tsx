import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

import { fontVariables } from './fonts'
import './globals.css'

// An address that matches no route at all has no [locale] root layout to render in, so Next
// serves this document on its own (experimental.globalNotFound). /zh addresses never get here:
// the proxy answers them first, so it is English. next/link: there is no locale context.
export const metadata: Metadata = { title: 'Page not found', robots: { index: false, follow: false } }

export default async function GlobalNotFound() {
  const t = await getTranslations({ locale: 'en', namespace: 'notFound' })
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-mono text-caption text-muted-foreground">404</p>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="max-w-sm text-muted-foreground">{t('body')}</p>
        <p className="flex gap-6">
          <Link href="/" className="underline underline-offset-4">
            {t('home')}
          </Link>
          <Link href="/generate" className="underline underline-offset-4">
            {t('templates')}
          </Link>
        </p>
      </body>
    </html>
  )
}
