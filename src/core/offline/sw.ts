import { CACHE_PREFIX } from './client-names'
import { routeFor } from './routes'
import { CREATE_PATHS } from './shell-fallback'
import { NO_SHELL, SHELL_HANDLERS } from './shell-worker'

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
export { CACHE_PREFIX }
const CATALOGUE_KEEP = 4
// First-screen template covers (LCP plan 1): the first screens of the last few Create screens used
// (All, a category), at most COVERS_KEEP covers, some 0.3 MB of 384 w AVIF. Kept across builds:
// a cover's name is its hash.
export const COVERS_KEEP = 24
export const COVER_SCREENS = 4
const KEEP_PER_SCREEN = 12
// After this many covers in a row from one host came back without CORS (a CDN copy cached before
// the header was added), the worker stops asking that host in CORS mode until it restarts.
const CORS_STRIKES = 3
// The longest a request waits on Cache Storage, or activation on one of its steps (inTime).
export const CACHE_WAIT_MS = 1500

// `cdnOrigins`: the static-file CDN's origin when it serves /_next/static and /fonts; the site's own
// origin is the worker's (self.location.origin), so previews and production alike are covered.
// `coverOrigins`: the hosts a page loads cover copies from (the image CDN, the assets bucket).
// `shell`: Create's app shell (shell-worker.ts, system_settings service_worker_shell_enabled).
type Options = { version: string; cdnOrigins: readonly string[]; coverOrigins?: readonly string[]; enabled: boolean; shell?: boolean }

const switchedOff = (prefix: string) => `// Shotviva service worker: switched off. Empties its caches and unregisters.
self.addEventListener('install', () => self.skipWaiting())
// Unregisters first (pages are uncontrolled from their next load on), then empties its caches, and
// gives up on them after ${CACHE_WAIT_MS} ms: activation never waits long on storage.
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  try {
    await self.registration.unregister()
  } catch {}
  await Promise.race([
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith(${prefix})) await caches.delete(key)
    })().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, ${CACHE_WAIT_MS})),
  ])
})()))
`

// The worker's request handling (the same for every build).
const HANDLERS = `// The cache is only ever a shortcut: any failure in it (a quota, an eviction race, an internal
// error) falls back to the network, so a file can never fail because of the worker. The network
// answer goes back at once; keeping a copy happens after, under waitUntil. A copy is kept only of
// a complete, readable answer (never an opaque or partial one).
// A cache step that has not settled after CACHE_WAIT_MS counts as nothing there: some engines'
// Cache Storage can stall instead of failing, and a request must never wait on it. After one such
// stall this worker stops reading its caches (the network answers everything) until it restarts.
const LATE = Symbol('late')
let cacheStalled = false
function inTime(promise) {
  let timer
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(LATE), ${CACHE_WAIT_MS})
  })
  return Promise.race([promise, late]).finally(() => clearTimeout(timer))
}

// A read never creates a cache (caches.open would): after sign-out's clear, a page that only looks
// leaves Cache Storage empty.
async function cachedIn(name, key) {
  if (cacheStalled) return undefined
  const hit = await inTime((async () => ((await caches.has(name)) ? (await caches.open(name)).match(key) : undefined))())
  if (hit !== LATE) return hit
  cacheStalled = true
  return undefined
}

async function cacheFirst(event, name, keep) {
  const request = event.request
  try {
    const hit = await cachedIn(name, request)
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

// First-screen covers (LCP plan 1). Each screen of Create (All, a category, Saved) names the
// covers of its first screen in one message once they have loaded (near-viewport.tsx,
// 'sv-keep-covers' with the screen's key): the new set replaces that screen's old one whole, so a
// screen whose templates changed drops the ones it no longer shows. The last COVER_SCREENS screens
// are kept (a chosen category never pushes out All, where the next launch lands), and never more
// than COVERS_KEEP covers in all: the screens used least recently go first. Scrolling never adds
// anything. Which covers belong to which screen is a small index kept in the same cache.
//
// A cover the page shows is a plain <img> (no CORS), whose answer could only be kept opaque: an
// unreadable copy that Chrome counts as about 7 MB of quota. So the worker fetches each named cover
// in CORS mode itself (the hosts send Access-Control-Allow-Origin: *; the browser's HTTP cache
// usually has it already) and keeps only a readable copy: 'cors' from another host, 'basic' from
// this site. A host that answers without the header gets nothing kept; after three in a row it is
// not asked again until the worker restarts.
const corsStrikes = new Map()
const INDEX = self.location.origin + '/__sv-covers-index'

async function readIndex(cache) {
  try {
    const stored = await cache.match(INDEX)
    const screens = stored ? await stored.json() : []
    return Array.isArray(screens) ? screens : []
  } catch {
    return []
  }
}

// A readable copy of one cover, from the cache or fetched in CORS mode; null when there is none.
async function readableCover(cache, url) {
  const hit = await cache.match(url)
  if (hit) return url
  const host = new URL(url).origin
  if ((corsStrikes.get(host) ?? 0) >= ${CORS_STRIKES}) return null
  let response
  try {
    response = await fetch(url, { mode: 'cors', credentials: 'omit' })
  } catch {
    corsStrikes.set(host, (corsStrikes.get(host) ?? 0) + 1)
    return null
  }
  const readable = response.type === 'cors' || (response.type === 'basic' && host === self.location.origin)
  if (response.status !== 200 || !readable) return null
  corsStrikes.set(host, 0)
  await cache.put(url, response)
  return url
}

async function keepScreen(screen, urls) {
  const cache = await caches.open(COVERS)
  const kept = []
  for (const url of urls) if (await readableCover(cache, url)) kept.push(url)
  // Most recently used screen last; this one's new set replaces its old one.
  const screens = (await readIndex(cache)).filter((entry) => entry && entry.screen !== screen)
  if (kept.length) screens.push({ screen, urls: kept })
  while (screens.length > ${COVER_SCREENS} || new Set(screens.flatMap((entry) => entry.urls)).size > ${COVERS_KEEP}) screens.shift()
  await cache.put(INDEX, new Response(JSON.stringify(screens), { headers: { 'Content-Type': 'application/json' } }))
  const wanted = new Set([INDEX, ...screens.flatMap((entry) => entry.urls)])
  for (const request of await cache.keys()) if (!wanted.has(request.url)) await cache.delete(request)
}

// One screen at a time, so two messages never interleave their index updates.
let keeping = Promise.resolve()
const keepCovers = (screen, urls) => (keeping = keeping.then(() => keepScreen(screen, urls)).catch(() => {}))

// A kept cover from the cache; any other cover, or any cache error, goes to the network as the
// browser asked for it, and nothing is written.
async function coverFirst(event) {
  try {
    const hit = await cachedIn(COVERS, event.request.url)
    if (hit) return hit
  } catch {}
  return fetch(event.request)
}

// Create's addresses, as the proxy matches them for its 204 (shell-fallback.ts).
const CREATE_PATHS = ${JSON.stringify(CREATE_PATHS)}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (shellFetch(event)) return
  if (request.mode === 'navigate') {
    // Always the network: the preloaded response when there is one, else a plain fetch. On Create's
    // two addresses an empty 204 preload is the proxy's answer to a shell-era preload
    // (shell-proxy.ts), never the page; anywhere else a 204 is the page's own answer.
    event.respondWith((async () => {
      try {
        const preloaded = await event.preloadResponse
        if (preloaded && !(preloaded.status === 204 && CREATE_PATHS.includes(new URL(request.url).pathname))) return preloaded
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

// Sign-out (and the page's own clear): drop every cache this worker made. 'sv-keep-covers': one
// screen's first-screen covers (anything that is not a cover's pre-sized copy is ignored; an empty
// list forgets that screen).
self.addEventListener('message', (event) => {
  if (shellMessage(event)) return
  if (event.data?.type === 'sv-drop-shell') event.waitUntil(dropShell(typeof event.data.build === 'string' ? event.data.build : '').catch(() => {}))
  else if (event.data === 'sv-clear') event.waitUntil((async () => {
    forgetEarly()
    for (const key of await caches.keys()) if (key.startsWith(PREFIX)) await caches.delete(key)
  })())
  else if (event.data?.type === 'sv-keep-covers' && typeof event.data.screen === 'string' && Array.isArray(event.data.urls)) {
    const screen = event.data.screen.slice(0, 120)
    const urls = [...new Set(event.data.urls.filter((url) => typeof url === 'string' && routeFor(url, 'GET', 'no-cors', ORIGINS, COVER_ORIGINS) === 'cover'))].slice(0, ${KEEP_PER_SCREEN})
    event.waitUntil(keepCovers(screen, urls))
  }
})
`

export function serviceWorkerSource({ version, cdnOrigins, coverOrigins = [], enabled, shell = false }: Options): string {
  const prefix = JSON.stringify(CACHE_PREFIX)
  if (!enabled) return switchedOff(prefix)
  return `// Shotviva service worker, build ${JSON.stringify(version).slice(1, -1)}. Public, content-hashed files only.
const PREFIX = ${prefix}
const STATIC = PREFIX + 'static-' + ${JSON.stringify(version)}
const CATALOGUE = PREFIX + 'catalogue'
const COVERS = PREFIX + 'covers'
const VERSION = ${JSON.stringify(version)}
// Create's app shell: kept across activation only while its switch is on.
const SHELL = PREFIX + 'shell-' + VERSION
const KEEP_SHELL = ${shell ? 'SHELL' : "''"}
const ORIGINS = [self.location.origin, ...${JSON.stringify(cdnOrigins)}]
const COVER_ORIGINS = [self.location.origin, ...${JSON.stringify(coverOrigins)}]
const routeFor = ${routeFor.toString()}

// Install may take its time (the worker it replaces still answers meanwhile); it never fails.
self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(shellInstall().catch(() => {}))
})
// Activation must be quick and can never hang: while it runs, every request of the site waits for
// it. Nothing here touches the network, and each storage step gives up after CACHE_WAIT_MS.
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  // Navigations then start their request while the worker boots (they are never answered from a cache).
  try {
    if (self.registration.navigationPreload) await inTime(self.registration.navigationPreload.enable())
  } catch {}
  try {
    await inTime((async () => {
      for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== STATIC && key !== CATALOGUE && key !== COVERS && key !== KEEP_SHELL) await caches.delete(key)
    })())
  } catch {}
  try {
    await inTime(self.clients.claim())
  } catch {}
  await shellActivate()
})()))

${shell ? SHELL_HANDLERS : NO_SHELL}
${HANDLERS}`
}
