// The 56 regular (400) @font-face rules of the official aggregate stylesheet, copied verbatim
// (T67: MiSans for headings only, ARCHITECTURE §17). Chinese headings have always rendered MiSans
// 400 (the display role asks for 400), so they look exactly as before. About 82 KB raw instead
// of 245 for all three weights. Content-addressed: a change means a new hash here, never new bytes at
// this URL. The woff2 files are the official ones, untouched.
export const MISANS_STYLESHEET = '/fonts/misans/misans-400-e8d416058231a4c2.css'

// Chinese pages only (T65, ARCHITECTURE §17「加载」): the @font-face declarations go into the
// server-rendered <head> (React hoists a `precedence` stylesheet there and holds the first paint
// for it), so the browser knows every MiSans subset before its first layout. Subsets already in
// the cache are used on that first paint: no system-font frame, no swap flash on reloads or when
// switching from English. A first visit still paints the headings in the metric-matched
// "MiSans Fallback" (globals.css) and swaps once their subsets arrive. Body text is in the
// system fonts and never waits. unicode-range keeps the download to the
// subsets the page's text needs; the woff2 files are never preloaded. English pages show their
// few Chinese words in the system fonts (font-cjk-system) and never load MiSans.
export function MiSansStylesheet() {
  return <link rel="stylesheet" href={MISANS_STYLESHEET} precedence="default" />
}
