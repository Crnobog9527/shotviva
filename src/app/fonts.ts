import localFont from 'next/font/local'

// Self-hosted (DESIGN §3.2): Geist for UI, Geist Mono for measurements. Both OFL, files copied
// from design/comps-v3-b/fonts/. Each sets a CSS variable that globals.css folds into
// --font-sans / --font-mono. Instrument Serif (display, English pages only) is not here:
// next/font preloads a font on every page of a layout, and Chinese pages never use it
// (core/ui/instrument-serif.tsx, globals.css).
export const geist = localFont({
  src: './fonts/geist.woff2',
  weight: '400 700',
  variable: '--font-geist',
  display: 'swap',
})

export const geistMono = localFont({
  src: './fonts/geist-mono.woff2',
  weight: '400 500',
  variable: '--font-geist-mono',
  display: 'swap',
  preload: false,
})

export const fontVariables = `${geist.variable} ${geistMono.variable}`
