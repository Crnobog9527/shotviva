// Which requests the service worker answers (sw.ts embeds this function's source in /sw.js, and
// the tests call it directly, so both run the same code). Everything else, including every page
// navigation, every other /api route, /account, /admin and /partners, is never intercepted.
//   'static':    content-hashed scripts, styles and fonts (/_next/static, /fonts), on this site or
//                the static-file CDN: immutable, so the first copy is good forever.
//   'catalogue': Create's public catalogue file at a version (/api/catalogue/public/<locale>/<hash>),
//                immutable too. Its `latest` and `current` answers are never taken over.
// It must stay self-contained (no outer names) and plain JavaScript once compiled.
export function routeFor(href: string, method: string, mode: string, origins: readonly string[]): 'static' | 'catalogue' | null {
  if (method !== 'GET' || mode === 'navigate') return null
  let url
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.search) return null
  if (!origins.includes(url.origin)) return null
  if (/^\/(_next\/static|fonts)\//.test(url.pathname)) return 'static'
  if (url.origin === origins[0] && /^\/api\/catalogue\/public\/(en|zh)\/[0-9a-f]{16}$/.test(url.pathname)) return 'catalogue'
  return null
}
