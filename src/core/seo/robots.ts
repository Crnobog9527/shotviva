import type { MetadataRoute } from 'next'

import type { SiteConfig } from '../config'
import { AI_CRAWLERS, BLOCKED_CRAWLERS, PRELAUNCH_BLOCKED_CRAWLERS, PRIVATE_PATHS } from './crawlers'
import { indexingOpenNow } from './indexing-now'
import { siteOrigin } from './site-url'

export { AI_CRAWLERS, BLOCKED_CRAWLERS, PRELAUNCH_BLOCKED_CRAWLERS, PRIVATE_PATHS }

// Closed (ARCHITECTURE §12.0): everyone may fetch, so Google and Bing see the noindex; AI
// crawlers are disallowed; no Sitemap line. Open: 建站规格 R11 / G10 and SEO patch v5 item 3:
// everyone may fetch but the private routes, the AI crawlers are named and allowed, Bytespider is
// out, Sitemap last. No Host line (non-standard; Google and Bing ignore it).
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
      { userAgent: '*', allow: '/', disallow: [...PRIVATE_PATHS] },
      // A named group does not inherit the '*' group's rules (RFC 9309), so each AI crawler repeats
      // the private paths (SEO audit 2026-11-17, T2).
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/', disallow: [...PRIVATE_PATHS] })),
      ...BLOCKED_CRAWLERS.map((userAgent) => ({ userAgent, disallow: '/' })),
    ],
    sitemap: `${siteOrigin(site)}/sitemap.xml`,
  }
}
