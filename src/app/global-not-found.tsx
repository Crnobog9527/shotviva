import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'

import { AnnouncementBanner } from '@/core/announcements'
import { TranslatedPathsProvider } from '@/core/i18n/ui'
import { GeistFonts } from '@/core/ui/geist-fonts'
import { InstrumentSerifPreload } from '@/core/ui/instrument-serif'
import { loadMessages } from '@/site/i18n/messages'
import { site } from '@/site/site.config'

import { MarketingFooter, MarketingHeader } from './[locale]/marketing-chrome'
import { NotFoundContent } from './[locale]/not-found-content'
import './globals-public.css'

// An address that matches no route at all has no [locale] root layout to render in, so Next
// serves this document on its own (experimental.globalNotFound). /zh addresses never get here:
// the proxy answers them first, so it is English, in the same marketing shell as every 404.
export const metadata: Metadata = { title: `Page not found | ${site.brand.name}`, robots: { index: false, follow: false } }

export default async function GlobalNotFound() {
  // No [locale] segment here: pin the request locale so server components read 'en' without
  // touching request headers (which would stop the page from prerendering).
  setRequestLocale('en')
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <GeistFonts />
        <InstrumentSerifPreload />
        <NextIntlClientProvider locale="en" messages={await loadMessages('en')}>
          <TranslatedPathsProvider paths={site.locales.zhPaths}>
            <AnnouncementBanner />
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
