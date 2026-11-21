// The public pages warmed after an admin save (core/cache-warm) and after a deploy
// (scripts/warm-cache.mts reads scripts/html-budget.json): the home and landing pages in both
// languages and pricing, the ones PSI and the HTML budget watch. warm-pages.test.ts keeps the
// two lists the same.
export const PUBLIC_WARM_PATHS = [
  '/',
  '/zh',
  '/ai-restaurant-menu',
  '/zh/ai-restaurant-menu',
  '/commercial-photography',
  '/zh/commercial-photography',
  '/image-to-image-generator',
  '/zh/image-to-image-generator',
  '/transparent-background',
  '/pricing',
  '/zh/pricing',
] as const
