// Plain lists (no imports) so scripts/seo-check.ts can read them outside Next.

// Open site (SEO launch handbook 02-L2, 2026-11-10): every mainstream AI crawler, search and
// training alike, goes through the `*` group, so models learn the name "Shotviva" and AI search
// can cite it. No group of their own; the daily check only asserts none of them is disallowed.
export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
] as const

// Open site: the one crawler kept out (crawls hard, sends almost no visitors back).
export const OPEN_BLOCKED_CRAWLERS = ['Bytespider'] as const

// Open site: signed-in areas and the API, one concrete path per line, never a wildcard. /_next/
// and the image folders stay crawlable. Public pages that are only noindex (login, signup,
// /generate, /wishlist) stay crawlable too, so search engines read their noindex.
export const OPEN_DISALLOWED_PATHS = [
  '/api/',
  '/account',
  '/admin',
  '/checkout',
  '/connect',
  '/photos',
  '/zh/account',
  '/zh/admin',
  '/zh/checkout',
  '/zh/connect',
  '/zh/photos',
] as const

// Closed site (ARCHITECTURE §12.0): every AI crawler is disallowed. Googlebot and Bingbot stay
// on `*` (allowed), because a page they cannot fetch is a page whose noindex they never see.
export const PRELAUNCH_BLOCKED_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'CCBot',
  'Applebot-Extended',
  'Meta-ExternalAgent',
  'Bytespider',
  'Amazonbot',
] as const
