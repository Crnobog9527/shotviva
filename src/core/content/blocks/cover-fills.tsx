'use client'

import { useEffect } from 'react'

// The picture a fill copies: the first <img> after it in its pane, or inside the element after it
// (cover-fill.tsx draws the fill first, as the <img> it replaced was), never an inline first frame.
export function fillSource(fill: Element): HTMLImageElement | null {
  for (let next = fill.nextElementSibling; next; next = next.nextElementSibling) {
    const img = next instanceof HTMLImageElement ? next : next.querySelector('img')
    if (img && !img.classList.contains('mk-ff')) return img
  }
  return null
}

function paint(fill: HTMLElement, img: HTMLImageElement) {
  if (img.currentSrc) fill.style.backgroundImage = `url(${JSON.stringify(img.currentSrc)})`
}

// Every cover fill on the page, painted once its picture has loaded (lazily, as the picture
// itself is), with the file the browser chose from the srcset.
export function fillCovers(root: ParentNode): () => void {
  const offs: Array<() => void> = []
  for (const fill of root.querySelectorAll<HTMLElement>('[data-cover-fill]')) {
    const img = fillSource(fill)
    if (!img) continue
    if (img.complete && img.naturalWidth > 0) {
      paint(fill, img)
      continue
    }
    const onLoad = () => paint(fill, img)
    img.addEventListener('load', onLoad, { once: true })
    offs.push(() => img.removeEventListener('load', onLoad))
  }
  return () => {
    for (const off of offs) off()
  }
}

export function CoverFills() {
  useEffect(() => fillCovers(document), [])
  return null
}
