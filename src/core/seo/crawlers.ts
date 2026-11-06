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
