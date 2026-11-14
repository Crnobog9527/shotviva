import 'server-only'

import { publicEnv } from '../public-env'

// GET /api/version (T90): the version this deployment was built with, the same constant its
// pages carry (core/build-env appVersion). no-store all the way: browser, Vercel's CDN, proxies.
export function versionResponse(): Response {
  return Response.json(
    { version: publicEnv.NEXT_PUBLIC_APP_VERSION },
    { headers: { 'Cache-Control': 'no-store, max-age=0', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store' } },
  )
}
