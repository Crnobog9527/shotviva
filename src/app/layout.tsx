import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'

import { site } from '@/site/site.config'

import './globals.css'

export const metadata: Metadata = {
  title: site.brand.name,
  // Indexing is opened deliberately per page in T5; the scaffold stays out of search.
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang={site.locales.default} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
