// Content-addressed stylesheet copied verbatim from Graylum staging (public/fonts/misans/,
// ARCHITECTURE §17). A new font build means a new hash here, never new bytes at this URL.
export const MISANS_STYLESHEET = '/fonts/misans/misans-4bf5d8a22f58eaab.css'

// Chinese pages only (T65, ARCHITECTURE §17「加载」): the @font-face declarations go into the
// server-rendered <head> (React hoists a `precedence` stylesheet there and holds the first paint
// for it), so the browser knows every MiSans subset before its first layout. Subsets already in
// the cache are used on that first paint: no system-font frame, no swap flash on reloads or when
// switching from English. A first visit still paints the metric-matched "MiSans Fallback"
// (globals.css) and swaps once its subsets arrive. unicode-range keeps the download to the
// subsets the page's text needs; the woff2 files are never preloaded. English pages show their
// few Chinese words in the system fonts (font-cjk-system) and never load MiSans.
export function MiSansStylesheet() {
  return <link rel="stylesheet" href={MISANS_STYLESHEET} precedence="default" />
}
