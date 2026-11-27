// What the hotels list (spaces-section.tsx, server) leaves in the page for its viewer
// (hotel-case-viewer.tsx, client), so each case's words travel once, in the HTML: a case is a
// button with its index; the name, the line and the two picture labels are its own text. The
// full-size pictures are not in the page: the viewer asks /api/home/hotels for them.
export const HOTEL_OPEN_ATTR = 'data-hotel-open'

export type ViewerText = { title: string; change: string }
export type ViewerTags = { before: string; after: string }

const CASES = `.hc-case[${HOTEL_OPEN_ATTR}]`

export function readCases(root: ParentNode): ViewerText[] {
  return [...root.querySelectorAll(CASES)].map((button) => ({
    title: button.querySelector('.hc-title')?.textContent ?? '',
    change: button.querySelector('.hc-change')?.textContent ?? '',
  }))
}

export function readTags(root: ParentNode): ViewerTags {
  const [before, after] = root.querySelectorAll(`${CASES} .hc-tag`)
  return { before: before?.textContent ?? '', after: after?.textContent ?? '' }
}

// The list's own thumbnail of a case, for the viewer to show at once, under the full-size picture
// until that has loaded (or for good if it never does): the same srcset and sizes, AVIF source
// included, so the browser picks the same small file the list shows or is already fetching.
export type Thumb = { src: string; srcSet: string; sizes: string; avif: { srcSet: string; sizes: string } | null }

const attr = (el: Element | null | undefined, name: string) => el?.getAttribute(name) ?? ''

export function thumbOf(root: ParentNode, index: number, side: 0 | 1): Thumb | null {
  const img = root.querySelectorAll(CASES)[index]?.querySelectorAll('img')[side]
  if (!img) return null
  const source = img.closest('picture')?.querySelector('source[type="image/avif"]')
  return { src: attr(img, 'src'), srcSet: attr(img, 'srcset'), sizes: attr(img, 'sizes'), avif: source ? { srcSet: attr(source, 'srcset'), sizes: attr(source, 'sizes') } : null }
}

// On phones cases 3 and 4 are hidden and their thumbnails lazy, so they never load. Opening the
// viewer makes every list thumbnail eager: the hidden ones start loading their small file at once,
// before the viewer's code has even arrived.
export function wakeThumbs(root: ParentNode) {
  for (const img of root.querySelectorAll<HTMLImageElement>(`${CASES} img[loading="lazy"]`)) img.loading = 'eager'
}

// A case's button, if it is on screen (phones show the first two only).
export function shownCase(root: ParentNode, index: number): HTMLElement | null {
  const button = root.querySelectorAll<HTMLElement>(CASES)[index]
  return button && button.getClientRects().length > 0 ? button : null
}
