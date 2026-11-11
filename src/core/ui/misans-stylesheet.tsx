// The 56 regular (400) @font-face rules of the official aggregate stylesheet, copied verbatim
// (T67: MiSans for headings only, ARCHITECTURE §17). Chinese headings have always rendered MiSans
// 400 (the display role asks for 400), so they look exactly as before. About 82 KB raw instead
// of 245 for all three weights. Content-addressed: a change means a new hash here, never new bytes at
// this URL. The woff2 files are the official ones, untouched.
export const MISANS_STYLESHEET = '/fonts/misans/misans-400-e8d416058231a4c2.css'

const LINK_ID = 'misans-font'

// Set once the stylesheet has loaded in this browser, to the stylesheet's own address, so a new
// font version starts over. A plain "seen it" note like the dismissed announcement's
// (core/announcements): nothing about the visitor.
const SEEN_KEY = 'sv-misans'

// Chinese pages only (T65/T67, ARCHITECTURE §17「加载」). A script in the server HTML, at the top
// of <body>, attaches the stylesheet once the first screen is done, so the heading subsets (14
// files, about 430 KB on the home page, all fetched at the highest priority) never compete with
// the first screen's own image and scripts:
// - first visit: after the window's load event, when the browser is idle. Until then headings
//   show in the metric-matched "MiSans Fallback" (globals.css), then swap without moving.
// - later visits (SEEN_KEY is set, so the files are in the HTTP cache, immutable for a year):
//   right after the first contentful paint, as before; the swap costs no download.
// Measured, every earlier variant cost the first screen on a slow link: a render-blocking <link>
// in <head> (+0.15 s FCP on Vercel, up to 0.9 s in CI's Lighthouse); subsets requested before the
// first paint, which Lighthouse charges to FCP (2.6 s instead of 1.4 s); and loading at the first
// paint with a 1 s fallback timer, which on a slow phone fired before anything had painted and,
// when it did not, still re-laid every heading while the page was hydrating (TBT +136 ms, Speed
// Index +0.5 s against the English page under real slow-4G throttling). Body and UI text are in
// the system fonts and never change. English pages never load MiSans. The language switch is a
// full page load (a real <a href>), so this always runs on arriving at a Chinese page.
const INSERT = [
  `(function(){var d=document,w=window,done=0,K='${SEEN_KEY}',U='${MISANS_STYLESHEET}',seen=0;`,
  `function go(){if(done||d.getElementById('${LINK_ID}'))return;done=1;var l=d.createElement('link');l.id='${LINK_ID}';l.rel='stylesheet';l.href=U;l.onload=function(){try{localStorage.setItem(K,U)}catch(e){}};d.head.appendChild(l)}`,
  'function idle(){w.requestIdleCallback?w.requestIdleCallback(go,{timeout:2000}):setTimeout(go,200)}',
  'try{seen=localStorage.getItem(K)===U}catch(e){}',
  "if(seen)try{new PerformanceObserver(function(p,o){if(p.getEntriesByName('first-contentful-paint').length){o.disconnect();go()}}).observe({type:'paint',buffered:true})}catch(e){}",
  "d.readyState==='complete'?idle():w.addEventListener('load',idle,{once:true})})()",
].join('')

export function MiSansStylesheet() {
  return <script id="misans-font-loader" dangerouslySetInnerHTML={{ __html: INSERT }} />
}
