import { LAST_UPDATED } from './legal/shared'

// <lastmod> for every sitemap address (SEO patch v5 item 2): the day the page's own content last
// changed, never the deploy date. When you change a page's copy, set its date here in the same PR
// (YYYY-MM-DD). A test fails if a sitemap address has no date or a date in the future.
// Dates on 2026-11-12: the last commit to each page's content files (src/site/content). The legal
// pages show one shared "Last updated" date (legal/shared.ts), so their lastmod is that date.
export const PAGE_LASTMOD: Readonly<Record<string, string>> = {
  '/': '2026-11-13',
  '/image-to-image-generator': '2026-11-13',
  '/commercial-photography': '2026-11-13',
  '/ai-restaurant-menu': '2026-11-13',
  '/transparent-background': '2026-11-13',
  '/pricing': '2026-11-12',
  '/terms': LAST_UPDATED,
  '/privacy': LAST_UPDATED,
  '/refund-policy': LAST_UPDATED,
  '/acceptable-use': LAST_UPDATED,
  '/zh': '2026-11-13',
  '/zh/image-to-image-generator': '2026-11-13',
  '/zh/commercial-photography': '2026-11-13',
  '/zh/ai-restaurant-menu': '2026-11-13',
  '/zh/pricing': '2026-11-12',
}
