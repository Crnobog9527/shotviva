import { publicEnv } from '../public-env'

// The 56 regular (400) @font-face rules of the official aggregate stylesheet, copied verbatim
// (T67: MiSans for headings only, ARCHITECTURE §17). Chinese headings have always rendered MiSans
// 400 (the display role asks for 400), so they look exactly as before. About 82 KB raw instead
// of 245 for all three weights. Content-addressed: a change means a new hash here, never new bytes at
// this URL. The woff2 files are the official ones, untouched.
export const MISANS_STYLESHEET = '/fonts/misans/misans-400-e8d416058231a4c2.css'
// On the static-file CDN when it is on (its woff2 URLs are relative, so they follow the sheet).
const MISANS_HREF = `${publicEnv.NEXT_PUBLIC_ASSET_CDN_URL ?? ''}${MISANS_STYLESHEET}`

const LINK_ID = 'misans-font'

// Chinese pages only (T65/T67, ARCHITECTURE §17「加载」). A script in the server HTML, at the top
// of <body>, attaches the stylesheet as soon as the page's first contentful paint has happened
// (PerformanceObserver 'paint', with a 1 s fallback): long before hydration, which the old
// inserter waited for, but never ahead of the first paint. Measured, both earlier variants cost
// the first paint: a render-blocking <link> in <head> (+0.15 s FCP on Vercel, up to 0.9 s in CI's
// Lighthouse), and heading subsets requested before the first paint, which Lighthouse charges to
// FCP (2.6 s instead of 1.4 s). On a repeat visit the stylesheet and subsets come from the cache,
// so headings turn MiSans a frame or two after the first paint; a first visit paints them in the
// metric-matched "MiSans Fallback" (globals.css) and swaps once they arrive. Body and UI text are
// in the system fonts and never change. English pages never load MiSans. The language switch is
// a full page load (a real <a href>), so this always runs on arriving at a Chinese page.
const INSERT = [
  '(function(){var d=document,done=0;',
  `function go(){if(done||d.getElementById('${LINK_ID}'))return;done=1;var l=d.createElement('link');l.id='${LINK_ID}';l.rel='stylesheet';l.href='${MISANS_HREF}';d.head.appendChild(l)}`,
  "try{new PerformanceObserver(function(p){if(p.getEntriesByName('first-contentful-paint').length)go()}).observe({type:'paint',buffered:true})}catch(e){}",
  'setTimeout(go,1000)})()',
].join('')

export function MiSansStylesheet() {
  return <script id="misans-font-loader" dangerouslySetInnerHTML={{ __html: INSERT }} />
}
