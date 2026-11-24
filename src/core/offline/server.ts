import 'server-only'

import { serverEnv } from '../env'
import { publicEnv } from '../public-env'
import { serviceWorkerSource } from './sw'

// The static-file CDN's origin, when one serves /_next/static and /fonts (NEXT_PUBLIC_ASSET_CDN_URL);
// the worker adds the site's own origin itself.
export function cdnOrigins(assetCdn: string | undefined): string[] {
  return assetCdn ? [new URL(assetCdn).origin] : []
}

// The hosts a page loads template cover copies from (core/presized): the image CDN and the assets
// bucket when they are not this site; the worker adds the site's own origin itself.
export function coverOrigins(...urls: (string | undefined)[]): string[] {
  const origins = urls.flatMap((url) => {
    if (!url) return []
    try {
      return [new URL(url).origin]
    } catch {
      return []
    }
  })
  return [...new Set(origins)]
}

// /sw.js: revalidated on every check (no-cache) so a deploy, or the admin switch (and kill switch,
// `enabled`), reaches every installed copy on its next visit.
export function serviceWorkerResponse(enabled: boolean): Response {
  const source = serviceWorkerSource({
    version: publicEnv.NEXT_PUBLIC_APP_VERSION,
    cdnOrigins: cdnOrigins(publicEnv.NEXT_PUBLIC_ASSET_CDN_URL),
    coverOrigins: coverOrigins(publicEnv.NEXT_PUBLIC_PRESIZED_IMAGES_URL, publicEnv.NEXT_PUBLIC_ASSETS_BASE_URL),
    enabled,
  })
  return new Response(source, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

// Whether pages register the worker: production builds only (never `next dev`).
export const registersServiceWorker = () => serverEnv().NODE_ENV === 'production'
