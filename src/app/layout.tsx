import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'

import { rootMetadata } from '@/core/seo'
import { site } from '@/site/site.config'

import './globals.css'

// Default robots is noindex; only paths in site.indexing opt in (core/seo/indexing.ts).
export const metadata: Metadata = rootMetadata(site)

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang={site.locales.default} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
