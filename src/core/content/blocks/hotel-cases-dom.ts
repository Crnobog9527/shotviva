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

// The thumbnail a case shows, as the picture the viewer falls back to when its request fails.
export function thumbSrc(root: ParentNode, index: number, side: 0 | 1): string {
  return root.querySelectorAll<HTMLImageElement>(`${CASES}`)[index]?.querySelectorAll('img')[side]?.currentSrc ?? ''
}

// A case's button, if it is on screen (phones show the first two only).
export function shownCase(root: ParentNode, index: number): HTMLElement | null {
  const button = root.querySelectorAll<HTMLElement>(CASES)[index]
  return button && button.getClientRects().length > 0 ? button : null
}
