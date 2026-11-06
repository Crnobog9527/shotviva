import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'

import { TranslatedPathsProvider } from '@/core/i18n/ui'
import { loadMessages } from '@/site/i18n/messages'
import { site } from '@/site/site.config'

import { MarketingFooter, MarketingHeader } from './[locale]/marketing-chrome'
import { NotFoundContent } from './[locale]/not-found-content'
import { fontVariables } from './fonts'
import './globals.css'

// An address that matches no route at all has no [locale] root layout to render in, so Next
// serves this document on its own (experimental.globalNotFound). /zh addresses never get here:
// the proxy answers them first, so it is English, in the same marketing shell as every 404.
export const metadata: Metadata = { title: `Page not found | ${site.brand.name}`, robots: { index: false, follow: false } }

export default async function GlobalNotFound() {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale="en" messages={await loadMessages('en')}>
          <TranslatedPathsProvider paths={site.locales.zhPaths}>
            <MarketingHeader locale="en" />
            <main className="flex flex-1 flex-col">
              <NotFoundContent locale="en" />
            </main>
            <MarketingFooter locale="en" />
          </TranslatedPathsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
