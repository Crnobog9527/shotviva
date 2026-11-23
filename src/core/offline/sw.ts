import { routeFor } from './routes'

// The site's service worker (/sw.js), for the home-screen app above all (after Lovart): a launch
// after iOS dropped the app reads the scripts, styles and fonts from the phone instead of over the
// cross-border link. Public, content-hashed files only. Never a page from a cache, never the
// account's data: navigations go to the network (through navigation preload, so the worker's
// start-up overlaps the request), and every other request is left to the browser (routes.ts).
//
// On or off is the admin switch system_settings service_worker_enabled (default off, read when
// /sw.js is requested). Off is also the kill switch: /sw.js becomes a worker that empties its
// caches and unregisters itself, and pages unregister any worker they find.

// Cache names: one per build for the static files (a deploy's files live under its own name, and
// activation deletes every other build's), one for catalogue files across builds (a few kept).
export const CACHE_PREFIX = 'sv-'
const CATALOGUE_KEEP = 4

// `cdnOrigins`: the static-file CDN's origin when it serves /_next/static and /fonts; the site's own
// origin is the worker's (self.location.origin), so previews and production alike are covered.
type Options = { version: string; cdnOrigins: readonly string[]; enabled: boolean }

const switchedOff = (prefix: string) => `// Shotviva service worker: switched off. Empties its caches and unregisters.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(${prefix})) await caches.delete(key)
  await self.registration.unregister()
})()))
`

// The worker's request handling (the same for every build).
const HANDLERS = `// The cache is only ever a shortcut: any failure in it (a quota, an eviction race, an internal
// error) falls back to the network, so a file can never fail because of the worker. The network
// answer goes back at once; keeping a copy happens after, under waitUntil. A copy is kept only of
// a complete, readable answer (never an opaque or partial one).
async function cacheFirst(event, name, keep) {
  const request = event.request
  try {
    const hit = await (await caches.open(name)).match(request)
    if (hit) return hit
  } catch {}
  const response = await fetch(request)
  if (response.ok && response.status === 200 && response.type !== 'opaque') {
    const copy = response.clone()
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(name)
        await cache.put(request, copy)
        if (keep) {
          const keys = await cache.keys()
          for (const old of keys.slice(0, Math.max(0, keys.length - keep))) await cache.delete(old)
        }
      } catch {}
    })())
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.mode === 'navigate') {
    // Always the network: the preloaded response when there is one, else a plain fetch.
    event.respondWith((async () => {
      try {
        const preloaded = await event.preloadResponse
        if (preloaded) return preloaded
      } catch {}
      return fetch(request)
    })())
    return
  }
  const route = routeFor(request.url, request.method, request.mode, ORIGINS)
  if (route === 'static') event.respondWith(cacheFirst(event, STATIC, 0))
  else if (route === 'catalogue') event.respondWith(cacheFirst(event, CATALOGUE, ${CATALOGUE_KEEP}))
})

// Sign-out (and the page's own clear): drop every cache this worker made.
self.addEventListener('message', (event) => {
  if (event.data === 'sv-clear') event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX)) await caches.delete(key)
  })())
})
`

export function serviceWorkerSource({ version, cdnOrigins, enabled }: Options): string {
  const prefix = JSON.stringify(CACHE_PREFIX)
  if (!enabled) return switchedOff(prefix)
  return `// Shotviva service worker, build ${JSON.stringify(version).slice(1, -1)}. Public, content-hashed files only.
const PREFIX = ${prefix}
const STATIC = PREFIX + 'static-' + ${JSON.stringify(version)}
const CATALOGUE = PREFIX + 'catalogue'
const ORIGINS = [self.location.origin, ...${JSON.stringify(cdnOrigins)}]
const routeFor = ${routeFor.toString()}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  // Navigations then start their request while the worker boots (they are never answered from a cache).
  try {
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
  } catch {}
  try {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== STATIC && key !== CATALOGUE) await caches.delete(key)
  } catch {}
  await self.clients.claim()
})()))

${HANDLERS}`
}
