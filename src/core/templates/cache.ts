// Cache tag for pages that show the template catalogue (home, template pages; T8 tags them
// with cacheTag). The admin page expires it on every save or cover change, so a new cover is
// live on the next request without a redeploy (ARCHITECTURE §8.3).
export const TEMPLATES_CACHE_TAG = 'templates'
