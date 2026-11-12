import type { MetadataRoute } from 'next'

import type { SiteConfig } from '../config'
import { AI_CRAWLERS, OPEN_BLOCKED_CRAWLERS, OPEN_DISALLOWED_PATHS, PRELAUNCH_BLOCKED_CRAWLERS } from './crawlers'
import { indexingOpenNow } from './indexing-now'
import { siteOrigin } from './site-url'

export { AI_CRAWLERS, OPEN_BLOCKED_CRAWLERS, OPEN_DISALLOWED_PATHS, PRELAUNCH_BLOCKED_CRAWLERS }

// Closed (ARCHITECTURE §12.0): everyone may fetch, so Google and Bing see the noindex; AI
// crawlers are disallowed; no Sitemap or Host line. Open (SEO launch handbook 02-L2): everyone,
// AI crawlers included, may fetch all but the private paths; only Bytespider is kept out.
export function robotsRules(site: SiteConfig, open: boolean = indexingOpenNow()): MetadataRoute.Robots {
  if (!open) {
    return {
      rules: [
        { userAgent: '*', allow: '/' },
        { userAgent: [...PRELAUNCH_BLOCKED_CRAWLERS], disallow: '/' },
      ],
    }
  }
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: [...OPEN_DISALLOWED_PATHS] },
      { userAgent: [...OPEN_BLOCKED_CRAWLERS], disallow: '/' },
    ],
    sitemap: `${siteOrigin(site)}/sitemap.xml`,
  }
}
