import { getImageProps } from 'next/image'

import { coverLoaderFor } from '../../ui/cover-image'
import { setImageRatio } from '../../ui/image-ratio'
import { capSrcSet } from '../../ui/srcset-cap'

// A series card's later pairs, drawn in the browser the first time the card plays instead of by
// the server: every member's four pictures used to be in the page as hidden layers, 53 of them on
// the home page, about 260 KB of HTML and RSC payload no visitor sees before a hover (PSI P-1,
// 2026-11-21). Their addresses then rode on the frame, still about 55 KB of the home page (in the
// HTML and again in the RSC payload); now the frame carries only the card's key, and the
// addresses come from /api/home/series, one cached request, when a card first plays
// (series-layers-source.ts).

export type LayerPair = readonly [before: string, after: string]

// On a frame with later pairs: the card's key in /api/home/series (TemplateCard.id).
export const MORE_ATTR = 'data-series-more'
export const SIZES_ATTR = 'data-series-sizes'
const BUILT_ATTR = 'data-series-built'
const SIZE = { width: 900, height: 1125 }

// Only well-formed before/after pairs from what the API sent.
export function pairsIn(value: unknown): LayerPair[] {
  if (!Array.isArray(value)) return []
  return value.filter((pair): pair is LayerPair => Array.isArray(pair) && pair.length === 2 && pair.every((url) => typeof url === 'string'))
}

// The <img> SiteImage renders for a lazy cover (site-image.tsx: next/image's attributes, its
// loader, the srcset capped to the slot). The after plate gets white behind it once loaded, and
// its ratio for the plate, as WhiteGroundImage does.
export function pictureAttrs(url: string, sizes: string) {
  const loader = coverLoaderFor(url)
  const { props } = getImageProps({ src: url, alt: '', ...SIZE, sizes, loading: 'lazy', ...(loader ? { loader } : {}) })
  return capSrcSet({ sizes: props.sizes, srcSet: props.srcSet, src: props.src }, sizes)
}

function picture(doc: Document, url: string, sizes: string, className: string, after: boolean): HTMLImageElement {
  const img = doc.createElement('img')
  const attrs = pictureAttrs(url, sizes)
  img.className = className
  img.alt = ''
  img.loading = 'lazy'
  img.decoding = 'async'
  img.width = SIZE.width
  img.height = SIZE.height
  if (className === 'mk-fill') img.setAttribute('aria-hidden', 'true')
  if (after && className !== 'mk-fill') {
    img.addEventListener('load', () => {
      setImageRatio(img)
      img.classList.add('bg-photo-white')
    }, { once: true })
  }
  // sizes and srcset before src, as next/image orders them, so the full file is never fetched.
  if (attrs.sizes) img.sizes = attrs.sizes
  if (attrs.srcSet) img.srcset = attrs.srcSet
  img.src = attrs.src
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
export function buildLayers(frame: HTMLElement, pairs: readonly LayerPair[]): void {
  if (frame.hasAttribute(BUILT_ATTR)) return
  frame.setAttribute(BUILT_ATTR, '')
  const sizes = frame.getAttribute(SIZES_ATTR) ?? '100vw'
  const anchor = frame.querySelector(':scope > .mk-hl')
  for (const pair of pairs) frame.insertBefore(layerOf(frame.ownerDocument, pair, sizes), anchor)
}
