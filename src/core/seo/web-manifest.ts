import type { MetadataRoute } from 'next'

import type { SiteConfig } from '../config'
import { DEFAULT_LOCALE, htmlLang, type Locale } from '../i18n/locales'
import { localizePath } from '../i18n/paths'

// The web app manifest per language (T58; T65: a Chinese one). display stays `browser`: a
// standalone window would strand OAuth and hosted checkout redirects outside the user's browser.
// Colors are the darkroom `--background` (DESIGN §3.1), the same as the viewport's themeColor.
// The Chinese manifest starts at /zh, so a /zh page added to the home screen opens in Chinese.
export const MANIFEST_PATHS: Record<Locale, `/${string}`> = { en: '/manifest.webmanifest', zh: '/manifest.zh.webmanifest' }

export function webManifest(site: SiteConfig, locale: Locale = DEFAULT_LOCALE, description: string = site.brand.tagline): MetadataRoute.Manifest {
  return {
    name: site.brand.name,
    short_name: site.brand.name,
    description,
    lang: htmlLang(locale),
    start_url: localizePath('/', locale),
    display: 'browser',
    background_color: '#0B0A09',
    theme_color: '#0B0A09',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}

export function manifestResponse(manifest: MetadataRoute.Manifest): Response {
  return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } })
}
