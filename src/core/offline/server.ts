import 'server-only'

import { serverEnv } from '../env'
import { publicEnv } from '../public-env'
import { SERVICE_WORKER_ENABLED, serviceWorkerSource } from './sw'

// The static-file CDN's origin, when one serves /_next/static and /fonts (NEXT_PUBLIC_ASSET_CDN_URL);
// the worker adds the site's own origin itself.
export function cdnOrigins(assetCdn: string | undefined): string[] {
  return assetCdn ? [new URL(assetCdn).origin] : []
}

// /sw.js: revalidated on every check (no-cache) so a deploy, or the kill switch, reaches every
// installed copy on its next visit.
export function serviceWorkerResponse(): Response {
  const source = serviceWorkerSource({
    version: publicEnv.NEXT_PUBLIC_APP_VERSION,
    cdnOrigins: cdnOrigins(publicEnv.NEXT_PUBLIC_ASSET_CDN_URL),
    enabled: SERVICE_WORKER_ENABLED,
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
