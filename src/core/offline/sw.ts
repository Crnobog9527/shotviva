import { routeFor } from './routes'

// The site's service worker (/sw.js), for the home-screen app above all (after Lovart): a launch
// after iOS dropped the app reads the scripts, styles and fonts from the phone instead of over the
// cross-border link. Public, content-hashed files only. Never a page, never the account's data:
// navigations and every other request go to the network untouched (routes.ts).
//
// Kill switch: set SERVICE_WORKER_ENABLED = false and deploy. /sw.js then becomes a worker that
// empties its caches and unregisters itself, and the page unregisters any worker it finds.
export const SERVICE_WORKER_ENABLED = true

// Cache names: one per build for the static files (a deploy's files live under its own name, and
// activation deletes every other build's), one for catalogue files across builds (a few kept).
export const CACHE_PREFIX = 'sv-'
const CATALOGUE_KEEP = 4

// `cdnOrigins`: the static-file CDN's origin when it serves /_next/static and /fonts; the site's own
// origin is the worker's (self.location.origin), so previews and production alike are covered.
type Options = { version: string; cdnOrigins: readonly string[]; enabled?: boolean }

export function serviceWorkerSource({ version, cdnOrigins, enabled = SERVICE_WORKER_ENABLED }: Options): string {
  const prefix = JSON.stringify(CACHE_PREFIX)
  if (!enabled) {
    return `// Shotviva service worker: switched off. Empties its caches and unregisters.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(${prefix})) await caches.delete(key)
  await self.registration.unregister()
})()))
`
  }
  return `// Shotviva service worker, build ${JSON.stringify(version).slice(1, -1)}. Public, content-hashed files only.
const PREFIX = ${prefix}
const STATIC = PREFIX + 'static-' + ${JSON.stringify(version)}
const CATALOGUE = PREFIX + 'catalogue'
const ORIGINS = [self.location.origin, ...${JSON.stringify(cdnOrigins)}]
const routeFor = ${routeFor.toString()}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== STATIC && key !== CATALOGUE) await caches.delete(key)
  await self.clients.claim()
})()))

// A copy is kept only for a complete, readable answer (never an opaque or partial one).
async function cacheFirst(name, request, keep) {
  const cache = await caches.open(name)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok && response.status === 200 && response.type !== 'opaque') {
    await cache.put(request, response.clone())
    if (keep) {
      const keys = await cache.keys()
      for (const old of keys.slice(0, Math.max(0, keys.length - keep))) await cache.delete(old)
    }
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const route = routeFor(request.url, request.method, request.mode, ORIGINS)
  if (route === 'static') event.respondWith(cacheFirst(STATIC, request, 0))
  else if (route === 'catalogue') event.respondWith(cacheFirst(CATALOGUE, request, ${CATALOGUE_KEEP}))
})

// Sign-out (and the page's own clear): drop every cache this worker made.
self.addEventListener('message', (event) => {
  if (event.data === 'sv-clear') event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX)) await caches.delete(key)
  })())
})
`
}
