import { coverImage } from '../../ui/cover-image'
import { setImageRatio } from '../../ui/image-ratio'

// A series card's later pairs, drawn in the browser the first time the card plays instead of by
// the server: every member's four pictures used to be in the page as hidden layers, 53 of them on
// the home page, about 260 KB of HTML and RSC payload no visitor sees before a hover (PSI P-1,
// 2026-11-21). The server writes only the covers' addresses on the frame (series-card.tsx).

export type LayerPair = readonly [before: string, after: string]

export const PAIRS_ATTR = 'data-series-pairs'
export const SIZES_ATTR = 'data-series-sizes'
const BUILT_ATTR = 'data-series-built'
const SIZE = { width: '900', height: '1125' }

export function encodePairs(pairs: readonly LayerPair[]): string {
  return JSON.stringify(pairs)
}

export function decodePairs(value: string | null): LayerPair[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((pair): pair is LayerPair => Array.isArray(pair) && pair.length === 2 && pair.every((url) => typeof url === 'string'))
  } catch {
    return []
  }
}

// The <img> SiteImage would render for a cover: the image optimiser's srcset for the slot, lazy.
// The after plate gets white behind it once loaded, and its ratio for the plate (WhiteGroundImage).
function picture(doc: Document, url: string, sizes: string, className: string, after: boolean): HTMLImageElement {
  const img = doc.createElement('img')
  const cover = coverImage(url, sizes)
  img.className = className
  img.alt = ''
  img.loading = 'lazy'
  img.decoding = 'async'
  img.width = Number(SIZE.width)
  img.height = Number(SIZE.height)
  if (className === 'mk-fill') img.setAttribute('aria-hidden', 'true')
  if (after && className !== 'mk-fill') {
    img.addEventListener('load', () => {
      setImageRatio(img)
      img.classList.add('bg-photo-white')
    }, { once: true })
  }
  // srcset before src, as next/image orders them, so the browser never fetches the full file.
  if (cover.sizes) img.sizes = cover.sizes
  if (cover.srcSet) img.srcset = cover.srcSet
  img.src = cover.src
  return img
}

function pane(doc: Document, url: string, sizes: string, after: boolean): HTMLElement {
  const span = doc.createElement('span')
  span.className = 'mk-pane'
  span.append(picture(doc, url, sizes, 'mk-fill', after), picture(doc, url, sizes, after ? 'mk-sa' : 'mk-sb', after))
  return span
}

// One extra pair, stacked over the first (series-motion.ts fades them; marketing.css keeps a
// layer display: none until it is its turn, so its lazy pictures are not fetched before then).
export function layerOf(doc: Document, [before, after]: LayerPair, sizes: string): HTMLElement {
  const layer = doc.createElement('span')
  layer.className = 'mk-sl'
  layer.setAttribute('aria-hidden', 'true')
  layer.append(pane(doc, before, sizes, false), pane(doc, after, sizes, true))
  return layer
}

// Adds the frame's layers once, under the highlight and the tags as the server used to draw them.
export function buildLayers(frame: HTMLElement): void {
  if (frame.hasAttribute(BUILT_ATTR)) return
  frame.setAttribute(BUILT_ATTR, '')
  const sizes = frame.getAttribute(SIZES_ATTR) ?? '100vw'
  const anchor = frame.querySelector(':scope > .mk-hl')
  for (const pair of decodePairs(frame.getAttribute(PAIRS_ATTR))) frame.insertBefore(layerOf(frame.ownerDocument, pair, sizes), anchor)
}
