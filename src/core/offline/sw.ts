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
// Template covers (LCP plan 1): the most recently shown ones, about a screen and a half of the
// grid plus the home page's, some 0.5 MB of 384 w AVIF. Across builds: a cover's name is its hash.
export const COVERS_KEEP = 40
// After this many covers in a row from one host came back without CORS (a CDN copy cached before
// the header was added), the worker stops asking that host in CORS mode until it restarts.
const CORS_STRIKES = 3

// `cdnOrigins`: the static-file CDN's origin when it serves /_next/static and /fonts; the site's own
// origin is the worker's (self.location.origin), so previews and production alike are covered.
// `coverOrigins`: the hosts a page loads cover copies from (the image CDN, the assets bucket).
type Options = { version: string; cdnOrigins: readonly string[]; coverOrigins?: readonly string[]; enabled: boolean }

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

// A cover is shown by a plain <img> (no CORS), whose answer the worker could only keep opaque: an
// unreadable copy that Chrome counts as about 7 MB of quota. So the worker asks for it in CORS mode
// itself (the hosts send Access-Control-Allow-Origin: *) and keeps only that readable copy; a host
// that answers without the header gets the browser's own request, kept nowhere. A hit is moved to
// the end, and the oldest beyond COVERS_KEEP are dropped, so the covers shown most recently stay.
const corsStrikes = new Map()
async function coverFirst(event) {
  const request = event.request
  const url = request.url
  try {
    const cache = await caches.open(COVERS)
    const hit = await cache.match(url)
    if (hit) {
      const copy = hit.clone()
      event.waitUntil(cache.delete(url).then(() => cache.put(url, copy)).catch(() => {}))
      return hit
    }
  } catch {}
  const host = new URL(url).origin
  if ((corsStrikes.get(host) ?? 0) >= ${CORS_STRIKES}) return fetch(request)
  let response
  try {
    response = await fetch(url, { mode: 'cors', credentials: 'omit' })
  } catch {
    corsStrikes.set(host, (corsStrikes.get(host) ?? 0) + 1)
    return fetch(request)
  }
  if (response.status === 200 && response.type === 'cors') {
    corsStrikes.set(host, 0)
    const copy = response.clone()
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(COVERS)
        await cache.put(url, copy)
        const keys = await cache.keys()
        for (const old of keys.slice(0, Math.max(0, keys.length - ${COVERS_KEEP}))) await cache.delete(old)
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
  const route = routeFor(request.url, request.method, request.mode, ORIGINS, COVER_ORIGINS)
  if (route === 'static') event.respondWith(cacheFirst(event, STATIC, 0))
  else if (route === 'catalogue') event.respondWith(cacheFirst(event, CATALOGUE, ${CATALOGUE_KEEP}))
  else if (route === 'cover') event.respondWith(coverFirst(event))
})

// Sign-out (and the page's own clear): drop every cache this worker made.
self.addEventListener('message', (event) => {
  if (event.data === 'sv-clear') event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX)) await caches.delete(key)
  })())
})
`

export function serviceWorkerSource({ version, cdnOrigins, coverOrigins = [], enabled }: Options): string {
  const prefix = JSON.stringify(CACHE_PREFIX)
  if (!enabled) return switchedOff(prefix)
  return `// Shotviva service worker, build ${JSON.stringify(version).slice(1, -1)}. Public, content-hashed files only.
const PREFIX = ${prefix}
const STATIC = PREFIX + 'static-' + ${JSON.stringify(version)}
const CATALOGUE = PREFIX + 'catalogue'
const COVERS = PREFIX + 'covers'
const ORIGINS = [self.location.origin, ...${JSON.stringify(cdnOrigins)}]
const COVER_ORIGINS = [self.location.origin, ...${JSON.stringify(coverOrigins)}]
const routeFor = ${routeFor.toString()}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  // Navigations then start their request while the worker boots (they are never answered from a cache).
  try {
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
  } catch {}
  try {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== STATIC && key !== CATALOGUE && key !== COVERS) await caches.delete(key)
  } catch {}
  await self.clients.claim()
})()))

${HANDLERS}`
}
