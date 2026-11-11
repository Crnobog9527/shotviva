// /gallery?page=N (创作库规格 U11): 1–20 only, written plainly (no 0, no leading zero). Absent is
// page 1. Shared by the proxy, which answers anything else with a real 404 before rendering, and
// by the page, which reads the number inside its Suspense boundary so the wall stays prerenderable.
export const GALLERY_MAX_PAGES = 20

export function galleryPageOf(raw: string | string[] | null | undefined): number | null {
  if (raw === undefined || raw === null) return 1
  if (typeof raw !== 'string' || !/^[1-9]\d?$/.test(raw)) return null
  const page = Number(raw)
  return page <= GALLERY_MAX_PAGES ? page : null
}

// The proxy's check: a /gallery address (either language) with a page number that does not exist.
export function isBadGalleryPage(url: URL): boolean {
  if (!/^(\/zh)?\/gallery\/?$/.test(url.pathname)) return false
  const pages = url.searchParams.getAll('page')
  if (pages.length > 1) return true
  return pages.length === 1 && galleryPageOf(pages[0]) === null
}
