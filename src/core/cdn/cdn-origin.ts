import { publicEnv } from '../public-env'

// The asset host in front of the site (Alibaba Cloud ESA at https://cdn.shotviva.com, whose origin
// is https://shotviva.com). One switch, NEXT_PUBLIC_CDN_ORIGIN, inlined at build: set (Vercel
// Production scope only) → Next's own files (/_next/static: JS, CSS, next/font) load from it via
// assetPrefix (next.config.ts), and so do the public files this module rewrites; unset → every
// URL stays same-origin, exactly as before. Turning it off is removing the variable and
// redeploying. The CDN only proxies production, so a preview built with it set would ask the CDN
// for chunks production does not have: set it on a preview only to another host of that same
// preview (cross-origin, as in production).

type Origin = string | undefined

// A root-relative public file (/fonts/…, /cases/…) on the asset host. Anything else (absolute,
// protocol-relative, data:, blob:) passes through.
export function cdnUrl(path: string, origin: Origin = publicEnv.NEXT_PUBLIC_CDN_ORIGIN): string {
  if (!origin || !path.startsWith('/') || path.startsWith('//')) return path
  return `${origin}${path}`
}

// A template cover file stored under the site's own /assets (ARCHITECTURE §8.3「公开读」), served
// by the asset host instead. Only for files the browser fetches as stored (an animated cover, a
// loop video): stills go through the image optimiser, whose remotePatterns expect the stored URL,
// so they must keep it (core/ui/cover-image.ts).
export function cdnAssetUrl(
  url: string,
  origin: Origin = publicEnv.NEXT_PUBLIC_CDN_ORIGIN,
  base: string | undefined = publicEnv.NEXT_PUBLIC_ASSETS_BASE_URL,
): string {
  if (!origin || !base || !url.startsWith(`${base}/`)) return url
  let parsed: URL
  try {
    parsed = new URL(base)
  } catch {
    return url
  }
  // Only a base on the site's own /assets is behind the CDN (its origin is the site); an r2.dev
  // base (preview) is a different host the CDN does not proxy.
  if (parsed.pathname.replace(/\/+$/, '') !== '/assets') return url
  return `${origin}${url.slice(parsed.origin.length)}`
}
