// Plain lists (no imports) so scripts/seo-check.ts can read them outside Next.

// Open site: AI crawlers are named and allowed explicitly; GEO is the main traffic source
// (建站规格 R11, G10).
export const AI_CRAWLERS = ['GPTBot', 'OAI-SearchBot', 'PerplexityBot', 'ClaudeBot', 'ChatGPT-User'] as const

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

// Open site (SEO patch v5 item 3): the one crawler kept out entirely. Bytespider crawls hard and
// sends next to no visitors.
export const BLOCKED_CRAWLERS = ['Bytespider'] as const

// Open site: private routes no crawler needs, one path each, English and /zh. Not here on purpose:
// /_next/, images, /login, /signup, /generate and /wishlist; public pages link to those, and a
// crawler must be able to fetch them to see their noindex.
export const PRIVATE_PATHS = [
  '/api/',
  '/auth/',
  '/admin',
  '/account',
  '/checkout',
  '/photos',
  '/connect',
  '/zh/admin',
  '/zh/account',
  '/zh/checkout',
  '/zh/photos',
  '/zh/connect',
] as const
