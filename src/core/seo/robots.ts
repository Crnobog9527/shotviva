import type { MetadataRoute } from 'next'

import type { SiteConfig } from '../config'
import { AI_CRAWLERS, PRELAUNCH_BLOCKED_CRAWLERS } from './crawlers'
import { indexingOpenNow } from './indexing-now'
import { siteOrigin } from './site-url'

export { AI_CRAWLERS, PRELAUNCH_BLOCKED_CRAWLERS }

// Closed (ARCHITECTURE §12.0): everyone may fetch, so Google and Bing see the noindex; AI
// crawlers are disallowed; no Sitemap or Host line. Open: 建站规格 R11 / G10.
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
      { userAgent: '*', allow: '/' },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/' })),
    ],
    sitemap: `${siteOrigin(site)}/sitemap.xml`,
    host: siteOrigin(site),
  }
}
