import localFont from 'next/font/local'

// Self-hosted (DESIGN §3.2): Geist for UI, Geist Mono for measurements, Instrument Serif for
// display. All OFL, files copied from design/comps-v3-b/fonts/. Each sets a CSS variable that
// globals.css folds into --font-sans / --font-mono / --font-display.
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

export const instrumentSerif = localFont({
  src: [
    { path: './fonts/instrument-serif.woff2', weight: '400', style: 'normal' },
    { path: './fonts/instrument-serif-italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument-serif',
  display: 'swap',
})

export const fontVariables = `${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`
