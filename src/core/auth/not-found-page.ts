import { NextResponse, type NextRequest } from 'next/server'

import type { Locale } from '../i18n/locales'
import { localizePath } from '../i18n/paths'

// The static 404 page of each language (app/[locale]/(marketing)/page-not-found). A rewrite
// cannot carry a 404 status in Next, and notFound() under cacheComponents ships an empty error
// shell, so the proxy fetches this page's HTML and answers with it and status 404: the right
// <html lang> and text, server-rendered (ARCHITECTURE §17).
export const NOT_FOUND_PAGE = '/page-not-found'
// Marks the proxy's own fetch, the only request let through to the page (no loop, no 200 to
// visitors). Not a secret: forging it only shows the 404 page with a 200.
export const NOT_FOUND_RENDER_HEADER = 'x-shotviva-render-404'

export type FetchPage = (url: URL, init: RequestInit) => Promise<Response>

export function plainNotFound(): NextResponse {
  return new NextResponse('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' },
  })
}

export async function localizedNotFound(
  request: NextRequest,
  locale: Locale,
  fetchPage: FetchPage = (url, init) => fetch(url, init),
): Promise<NextResponse> {
  try {
    const page = await fetchPage(new URL(localizePath(NOT_FOUND_PAGE, locale), request.url), {
      // The visitor's cookies get the fetch past Vercel's preview protection.
      headers: { [NOT_FOUND_RENDER_HEADER]: '1', cookie: request.headers.get('cookie') ?? '' },
      cache: 'no-store',
    })
    if (!page.ok) return plainNotFound()
    return new NextResponse(await page.text(), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' },
    })
  } catch {
    return plainNotFound()
  }
}
