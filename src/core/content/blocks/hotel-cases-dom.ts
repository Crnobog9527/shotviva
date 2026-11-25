// What the hotels list (spaces-section.tsx, server) leaves in the page for its viewer
// (hotel-case-viewer.tsx, client) to read, so the cases travel once, in the HTML, and not again
// as client props: each case is a button carrying its index, its two thumbnails carry the full
// picture's address, and the name and line are the button's own text.
export const HOTEL_CASE_ATTR = 'data-hotel-case'
export const HOTEL_FULL_ATTR = 'data-full'

export type ViewerPicture = { src: string; alt: string }
export type ViewerCase = { title: string; change: string; before: ViewerPicture; after: ViewerPicture }

function picture(pic: Element | undefined): ViewerPicture {
  return { src: pic?.getAttribute(HOTEL_FULL_ATTR) ?? '', alt: pic?.querySelector('img')?.getAttribute('alt') ?? '' }
}

export function readCases(root: ParentNode): ViewerCase[] {
  return [...root.querySelectorAll(`[${HOTEL_CASE_ATTR}]`)].map((button) => {
    const [before, after] = button.querySelectorAll(`[${HOTEL_FULL_ATTR}]`)
    return {
      title: button.querySelector('.hc-title')?.textContent ?? '',
      change: button.querySelector('.hc-change')?.textContent ?? '',
      before: picture(before),
      after: picture(after),
    }
  })
}

export const caseButton = (root: ParentNode, index: number) => root.querySelector<HTMLElement>(`[${HOTEL_CASE_ATTR}="${index}"]`)
