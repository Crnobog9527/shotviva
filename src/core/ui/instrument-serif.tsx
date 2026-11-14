// Instrument Serif's two files (globals-body.css declares the faces, with a metric-matched
// fallback). Not preloaded: see GeistFonts (geist-fonts.tsx) for why no font is. Content-addressed
// like MiSans: a changed font ships under a new name here and in globals-body.css, never new bytes
// at these URLs (instrument-serif.test.ts keeps the places in step).
export const INSTRUMENT_SERIF_FILES = [
  '/fonts/instrument-serif/instrument-serif-60c06664b5a95c7d.woff2',
  '/fonts/instrument-serif/instrument-serif-italic-6ee678c33f388dd7.woff2',
] as const
