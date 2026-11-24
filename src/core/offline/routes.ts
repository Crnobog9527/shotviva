// Which requests the service worker answers (sw.ts embeds this function's source in /sw.js, and
// the tests call it directly, so both run the same code). Everything else, including every page
// navigation, every other /api route, /account, /admin and /partners, is never intercepted.
//   'static':    content-hashed scripts, styles and fonts (/_next/static, /fonts), on this site or
//                the static-file CDN: immutable, so the first copy is good forever.
//   'catalogue': Create's public catalogue file at a version (/api/catalogue/public/<locale>/<hash>),
//                immutable too. Its `latest` and `current` answers are never taken over.
//   'cover':     a template cover's pre-sized copy (core/presized: /assets/presized/… through the
//                site or the image CDN, /presized/… on the bucket itself), on one of `coverOrigins`.
//                Public, and named after the cover's content hash, so immutable as well. Never a
//                user's photo or work (those live under /api), never the site's own pictures.
// It must stay self-contained (no outer names) and plain JavaScript once compiled.
export function routeFor(
  href: string,
  method: string,
  mode: string,
  origins: readonly string[],
  coverOrigins: readonly string[] = [],
): 'static' | 'catalogue' | 'cover' | null {
  const parse = () => {
    try {
      const url = new URL(href)
      return method === 'GET' && mode !== 'navigate' && !url.search ? url : null
    } catch {
      return null
    }
  }
  const url = parse()
  if (!url) return null
  const { origin, pathname } = url
  const cover = /^\/(?:assets\/)?presized\/v\d+\/w\d+\/covers\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:(?:before|after|poster)-[0-9a-f]{16}|sync-[0-9a-f]{64})\.(?:avif|webp)$/
  const kinds = [
    ['cover', coverOrigins.includes(origin) && cover.test(pathname)],
    ['static', origins.includes(origin) && /^\/(_next\/static|fonts)\//.test(pathname)],
    ['catalogue', origin === origins[0] && /^\/api\/catalogue\/public\/(en|zh)\/[0-9a-f]{16}$/.test(pathname)],
  ] as const
  return kinds.find(([, matches]) => matches)?.[0] ?? null
}
