import type { MetadataRoute } from 'next'

import type { SiteConfig } from '../config'
import { siteOrigin } from './site-url'

// AI crawlers are named and allowed explicitly; GEO is the main traffic source (建站规格 R11, G10).
export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'PerplexityBot',
  'ClaudeBot',
  'ChatGPT-User',
] as const

export function robotsRules(site: SiteConfig): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/' })),
    ],
    sitemap: `${siteOrigin(site)}/sitemap.xml`,
    host: siteOrigin(site),
  }
}
