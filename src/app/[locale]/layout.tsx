import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { locale as rootLocale } from 'next/root-params'

import { ConsentSlot } from '@/core/analytics/browser'
import { clientMessages, htmlLang, isLocale } from '@/core/i18n'
import { TranslatedPathsProvider } from '@/core/i18n/ui'
import { rootMetadata, ShortcutTitleSync } from '@/core/seo'
import { MiSansStylesheet } from '@/core/ui/misans-stylesheet'
import { site } from '@/site/site.config'

import { fontVariables } from '../fonts'
import '../globals.css'

// Default robots is noindex; only paths in site.indexing opt in (core/seo/indexing.ts). The web
// app manifest follows the language (T65).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale()
  return rootMetadata(site, isLocale(locale) ? locale : site.locales.default)
}

// viewport-fit=cover so fixed bars can pad with env(safe-area-inset-*) (DESIGN §8.5).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0B0A09',
  colorScheme: 'dark',
}

// One tree for both languages (ARCHITECTURE §17): `en` is served unprefixed by the proxy's
// locale router, `zh` under /zh. The proxy never forwards any other first segment here.
export function generateStaticParams() {
  return site.locales.enabled.map((locale) => ({ locale }))
}


export default async function RootLayout({ children }: LayoutProps<'/[locale]'>) {
  const locale = await rootLocale()
  // Everything but the server-only namespaces (the admin entry's label, spec #186).
  const messages = clientMessages(await getMessages())
  const lang = isLocale(locale) ? locale : site.locales.default
  return (
    <html lang={htmlLang(lang)} className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {lang === 'zh' ? <MiSansStylesheet /> : null}
        <NextIntlClientProvider messages={messages}>
          <TranslatedPathsProvider paths={site.locales.zhPaths}>
            {children}
            {/* The analytics cookie bar, for EU/EEA/UK/CH visitors who have not answered (T70). */}
            <ConsentSlot />
            {/* Huawei Browser names a home-screen shortcut after the live page title (core/seo/shortcut-title.ts). */}
            <ShortcutTitleSync name={site.brand.name} />
          </TranslatedPathsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
