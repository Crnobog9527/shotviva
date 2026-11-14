import { publicEnv } from '../public-env'

// Geist (UI) and Geist Mono (measurements), DESIGN §3.2: self-hosted under content-hashed names in
// public/fonts/geist (public/fonts/README.md). They used to go through next/font, but with the
// stylesheets inlined (experimental.inlineCss) its @font-face url stayed on this host while its
// preload followed assetPrefix to the static-file CDN, so every page fetched Geist twice. Here the
// faces are written here, on one host: the static-file CDN when NEXT_PUBLIC_ASSET_CDN_URL is set,
// else this site. A changed font ships under a new name.
export const GEIST_FILE = '/fonts/geist/geist-9b6f5ff45b278c74.woff2'
export const GEIST_MONO_FILE = '/fonts/geist/geist-mono-5f3d6ad60f29d6cb.woff2'

// The metric-matched fallbacks next/font generated for these files (Arial adjusted to Geist's
// ascent, descent and width), so the swap to the real face does not move the layout. Arimo and
// Liberation Sans share Arial's metrics and stand in where Arial is missing (Linux, ChromeOS):
// without them the fallback face was skipped there and the swap shifted the page. The family
// names and the --font-geist / --font-geist-mono variables are the ones globals-body.css uses.
export function geistCss(host: string): string {
  return [
    `@font-face{font-family:geist;src:url(${host}${GEIST_FILE}) format("woff2");font-display:swap;font-weight:400 700}`,
    '@font-face{font-family:"geist Fallback";src:local(Arial),local(Arimo),local("Liberation Sans");ascent-override:94.56%;descent-override:27.76%;line-gap-override:0%;size-adjust:106.28%}',
    `@font-face{font-family:geistMono;src:url(${host}${GEIST_MONO_FILE}) format("woff2");font-display:swap;font-weight:400 500}`,
    '@font-face{font-family:"geistMono Fallback";src:local(Arial),local(Arimo),local("Liberation Sans");ascent-override:76.43%;descent-override:22.43%;line-gap-override:0%;size-adjust:131.49%}',
    ':root{--font-geist:geist,"geist Fallback";--font-geist-mono:geistMono,"geistMono Fallback"}',
  ].join('')
}

// Every page, at the top of <body>, before any text. No preload (font-preload-off.test.ts): Chrome
// holds the first paint for a preloaded font (or until a timeout), and the metric-matched fallback
// keeps the layout still while Geist arrives. Measured on production HTML, 2026-11-14: the first
// paint 40 ms sooner on a desktop and ~290 ms sooner on a throttled phone, CLS unchanged.
export function GeistFonts() {
  const host = publicEnv.NEXT_PUBLIC_ASSET_CDN_URL ?? ''
  return <style dangerouslySetInnerHTML={{ __html: geistCss(host) }} />
}
