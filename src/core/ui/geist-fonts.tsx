import { preconnect } from 'react-dom'

import { publicEnv } from '../public-env'
import { INSTRUMENT_SERIF_FILES } from './instrument-serif'

// Geist (UI) and Geist Mono (measurements), DESIGN §3.2: self-hosted under content-hashed names in
// public/fonts/geist (public/fonts/README.md). They used to go through next/font, but with the
// stylesheets inlined (experimental.inlineCss) its @font-face url stayed on this host while its
// preload followed assetPrefix to the static-file CDN, so every page fetched Geist twice. Here the
// faces are written here, on one host: the static-file CDN when NEXT_PUBLIC_ASSET_CDN_URL is set,
// else this site. A changed font ships under a new name.
export const GEIST_FILE = '/fonts/geist/geist-9b6f5ff45b278c74.woff2'
export const GEIST_MONO_UI_FILE = '/fonts/geist/geist-mono-ui-0d5338758e475926.woff2'
export const GEIST_MONO_FILE = '/fonts/geist/geist-mono-5f3d6ad60f29d6cb.woff2'

// The UI subset covers the numbers, Latin labels and punctuation used on the first screen.
const MONO_UI_RANGE = 'U+0020-007E,U+00A0,U+00B7,U+00D7,U+2000-200B,U+2010-2027,U+202F,U+2212'
// The rest of the original cmap. A CSS range keeps the full file off the wire for UI text
// and avoids requesting it for characters it never supported.
const MONO_REMAINING_RANGE = 'U+A1-AC,U+AE-B6,U+B8-D6,U+D8-FF,U+102,U+131,U+152-153,U+2BC,U+2C6,U+2DA,U+2DC,U+300-301,U+303-304,U+308-309,U+323,U+2032-2033,U+2039-203A,U+2044,U+20AC,U+2122,U+2191,U+2193'

// The metric-matched fallbacks next/font generated for these files (Arial adjusted to Geist's
// ascent, descent and width), so the swap to the real face does not move the layout. Arimo and
// Liberation Sans share Arial's metrics and stand in where Arial is missing (Linux, ChromeOS):
// without them the fallback face was skipped there and the swap shifted the page. The family
// names and the --font-geist / --font-geist-mono variables are the ones globals-body.css uses.
export function geistCss(host: string): string {
  return [
    `@font-face{font-family:geist;src:url(${host}${GEIST_FILE}) format("woff2");font-display:swap;font-weight:400 700}`,
    '@font-face{font-family:"geist Fallback";src:local(Arial),local(Arimo),local("Liberation Sans");ascent-override:94.56%;descent-override:27.76%;line-gap-override:0%;size-adjust:106.28%}',
    `@font-face{font-family:geistMono;src:url(${host}${GEIST_MONO_FILE}) format("woff2");font-display:swap;font-weight:400 500;unicode-range:${MONO_REMAINING_RANGE}}`,
    `@font-face{font-family:geistMono;src:url(${host}${GEIST_MONO_UI_FILE}) format("woff2");font-display:swap;font-weight:400 500;unicode-range:${MONO_UI_RANGE}}`,
    '@font-face{font-family:"geistMono Fallback";src:local(Arial),local(Arimo),local("Liberation Sans");ascent-override:76.43%;descent-override:22.43%;line-gap-override:0%;size-adjust:131.49%}',
    // Instrument Serif, the English display face, on the same host as Geist (PSI 2026-11-21 found
    // it on this site while Geist came from the static-file CDN: two font origins on the critical
    // chain). Only headings that use it fetch it, so Chinese pages still download neither file.
    `@font-face{font-family:"Instrument Serif";font-style:normal;font-weight:400;font-display:swap;src:url(${host}${INSTRUMENT_SERIF_FILES[0]}) format("woff2")}`,
    `@font-face{font-family:"Instrument Serif";font-style:italic;font-weight:400;font-display:swap;src:url(${host}${INSTRUMENT_SERIF_FILES[1]}) format("woff2")}`,
    '@font-face{font-family:"Instrument Serif Fallback";src:local(Arial),local(Arimo),local("Liberation Sans");ascent-override:128.92%;descent-override:40.37%;line-gap-override:0%;size-adjust:76.79%}',
    ':root{--font-geist:geist,"geist Fallback";--font-geist-mono:geistMono,"geistMono Fallback"}',
  ].join('')
}

// Every page, at the top of <body>, before any text. No preload (font-preload-off.test.ts): Chrome
// holds the first paint for a preloaded font (or until a timeout), and the metric-matched fallback
// keeps the layout still while Geist arrives. Measured on production HTML, 2026-11-14: the first
// paint 40 ms sooner on a desktop and ~290 ms sooner on a throttled phone, CLS unchanged.
//
// Fonts are fetched in CORS mode without credentials, so they cannot use the connection the
// scripts and pictures open to the static-file CDN (the Link: rel=preconnect Next sends has no
// crossorigin; PSI reported it unused for the fonts). A second, anonymous preconnect opens their
// connection while the HTML is still arriving. React hoists it into <head> and the Link header.
export function GeistFonts() {
  const host = publicEnv.NEXT_PUBLIC_ASSET_CDN_URL ?? ''
  if (host) preconnect(host, { crossOrigin: 'anonymous' })
  return <style dangerouslySetInnerHTML={{ __html: geistCss(host) }} />
}
