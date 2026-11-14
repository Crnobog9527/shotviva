// Instrument Serif's two files (globals-body.css declares the faces). Content-addressed like MiSans:
// a changed font ships under a new name here and in globals-body.css, never new bytes at these URLs
// (instrument-serif.test.ts keeps the three places in step).
export const INSTRUMENT_SERIF_FILES = [
  '/fonts/instrument-serif/instrument-serif-60c06664b5a95c7d.woff2',
  '/fonts/instrument-serif/instrument-serif-italic-6ee678c33f388dd7.woff2',
] as const

// English pages only: their H1 is set in this face, so both files are fetched with the document
// (what next/font did for every page). React hoists the links into <head>. A font preload must be
// a CORS request to be reused by the @font-face fetch, hence crossOrigin on a same-origin file.
// Always this site's own path, even with the static-file CDN on: the stylesheets are inlined into
// the HTML (experimental.inlineCss), so globals-body.css's root-relative url()s resolve against the
// page, and a preload on another host would download the font twice.
export function InstrumentSerifPreload() {
  return (
    <>
      {INSTRUMENT_SERIF_FILES.map((href) => (
        <link key={href} rel="preload" as="font" type="font/woff2" href={href} crossOrigin="anonymous" />
      ))}
    </>
  )
}
