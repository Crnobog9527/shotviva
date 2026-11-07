import { manifestResponse, webManifest } from '@/core/seo'
import { site } from '@/site/site.config'

// Public by nature: the English web app manifest (core/seo/web-manifest.ts). A route handler,
// not app/manifest.ts, because the file convention would override the per-language link the
// root layout sets (T65).
export function GET() {
  return manifestResponse(webManifest(site, 'en'))
}
