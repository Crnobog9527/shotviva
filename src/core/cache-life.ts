// The lifetime a 'use cache' read gives itself when the database read failed and it falls back
// to an empty result. Without it the fallback is cached for the read's normal lifetime (an hour
// to a day): a build that prerendered while the database was missing a migration kept serving
// "Templates are on the way" in production. A minute, so the next visitors after that retry;
// expire stays at 10 minutes, at least the 5 that keep the entry in the prerender and out of a
// request-time hole (cacheLife docs, "Prerendering behavior"); stale is left at its default.
export const FAILED_READ_LIFE = { revalidate: 60, expire: 600 } as const
