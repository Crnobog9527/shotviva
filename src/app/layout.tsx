import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'

import { rootMetadata } from '@/core/seo'
import { site } from '@/site/site.config'

import { fontVariables } from './fonts'
import './globals.css'

// Default robots is noindex; only paths in site.indexing opt in (core/seo/indexing.ts).
export const metadata: Metadata = rootMetadata(site)

// viewport-fit=cover so fixed bars can pad with env(safe-area-inset-*) (DESIGN §8.5).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0B0A09',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang={site.locales.default} className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
