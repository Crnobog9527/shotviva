// Create's app shell in the service worker (ARCHITECTURE §18.3, mobile speed plan 2). Plain
// JavaScript, embedded in /sw.js by sw.ts only while system_settings service_worker_shell_enabled is
// on; it uses the worker's PREFIX and VERSION. No regular expressions here: the source lives in a
// template string, where backslashes do not survive.
//
// - The shell is /app-shell/generate (or /zh/…): the Create frame with every personal part at its
//   placeholder. The worker fetches it itself, without credentials (the proxy also strips the
//   Cookie header on that path), and keeps only a 200, same-origin answer carrying this build's
//   X-SV-Shell header, in sv-shell-<build>. A navigation to /generate or /zh/generate is answered
//   with it at once, and it is fetched again behind. Without one: the network, as before.
// - Personal content no later than without the shell: once the shell page (answered from the
//   cache) says it is in the foreground (its inline script, before hydration), the worker starts
//   the RSC request the shell's router.refresh() will make (its headers recorded from the
//   last refresh under this build: headers only, never an answer), and hands that early answer to
//   the matching refresh, once, from memory. It carries the account (a same-origin request, with
//   cookies), so it is never written to any cache and is dropped after EARLY_MS unused.
// - Navigation preload: the header value says a shell is in use, and the proxy answers such a
//   preload of /generate with an empty 204 instead of rendering the page for nothing.
export const SHELL_PRELOAD_PREFIX = 'shell-'
const EARLY_MS = 30_000

export const SHELL_HANDLERS = `// Create's app shell (ARCHITECTURE §18.3).
const SHELL_PRELOAD = '${SHELL_PRELOAD_PREFIX}' + VERSION
const SHELL_TEMPLATES = self.location.origin + '/__sv-shell-refresh'

// /generate → /app-shell/generate, /zh/generate → /zh/app-shell/generate; null for anything else.
function shellPathFor(pathname) {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (path === '/generate') return '/app-shell/generate'
  if (path === '/zh/generate') return '/zh/app-shell/generate'
  return null
}
const localeOf = (pathname) => (pathname.startsWith('/zh/') ? 'zh' : 'en')

async function refreshShell(shellUrl) {
  try {
    const response = await fetch(shellUrl, { credentials: 'omit', cache: 'no-store', redirect: 'manual' })
    if (response.status !== 200 || response.type !== 'basic' || response.headers.get('x-sv-shell') !== VERSION) return
    await (await caches.open(SHELL)).put(shellUrl, response)
  } catch {}
}

async function readTemplates() {
  try {
    const stored = await (await caches.open(SHELL)).match(SHELL_TEMPLATES)
    const value = stored ? await stored.json() : null
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

// The RSC request headers Next's router sends, all of which the early request repeats and the
// match compares (x-deployment-id: skew protection pins the refresh to its deployment).
const RSC_HEADERS = ['rsc', 'next-router-state-tree', 'next-url', 'x-deployment-id']
function rscHeaders(headers) {
  const picked = {}
  for (const name of RSC_HEADERS) {
    const value = headers.get(name)
    if (value !== null) picked[name] = value
  }
  return picked
}
const sameHeaders = (a, b) => RSC_HEADERS.every((name) => (a[name] ?? null) === (b[name] ?? null))

// The refresh request's headers (no answer, nothing of the account: the router tree is the shell's).
async function rememberRefresh(locale, rsc, headers) {
  const templates = await readTemplates()
  if (templates[locale] && templates[locale].rsc === rsc && sameHeaders(templates[locale].headers ?? {}, headers)) return
  templates[locale] = { rsc, headers }
  await (await caches.open(SHELL)).put(SHELL_TEMPLATES, new Response(JSON.stringify(templates), { headers: { 'Content-Type': 'application/json' } }))
}

// The address without its _rsc parameter, as the key an early answer waits under.
function refreshKey(href) {
  const url = new URL(href)
  url.searchParams.delete('_rsc')
  return url.pathname + '?' + url.searchParams.toString()
}

// Early answers by address, each for the one window that asked (its client id): no other window,
// and no one after sign-out (forgetEarly), ever gets it.
const early = new Map()
async function startEarly(href, clientId) {
  const url = new URL(href)
  const template = (await readTemplates())[localeOf(url.pathname)]
  if (!template || typeof template.rsc !== 'string' || !template.headers || template.headers.rsc !== '1') return
  url.searchParams.set('_rsc', template.rsc)
  const answer = fetch(url.href, { headers: template.headers, credentials: 'same-origin' })
  // Keyed by window and address: a second window never replaces the first one's answer, and each
  // timer drops only its own entry.
  const key = clientId + ' ' + refreshKey(url.href)
  const entry = { rsc: template.rsc, headers: template.headers, clientId, answer, at: Date.now() }
  early.set(key, entry)
  setTimeout(() => {
    if (early.get(key) === entry) early.delete(key)
  }, ${EARLY_MS})
  await answer.catch(() => null)
}

async function shellFirst(event, shellUrl) {
  let hit
  try {
    hit = await (await caches.open(SHELL)).match(shellUrl)
  } catch {}
  event.waitUntil(refreshShell(shellUrl))
  if (hit) return hit
  try {
    const preloaded = await event.preloadResponse
    if (preloaded && preloaded.status !== 204) return preloaded
  } catch {}
  return fetch(event.request)
}

// The shell's own refresh: an RSC request for /generate whose router tree is the shell's.
function isShellRefresh(request) {
  if (request.method !== 'GET' || request.headers.get('rsc') !== '1' || request.headers.get('next-router-prefetch')) return false
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !shellPathFor(url.pathname)) return false
  const tree = request.headers.get('next-router-state-tree') || ''
  let decoded = tree
  try {
    decoded = decodeURIComponent(tree)
  } catch {}
  return decoded.includes('"app-shell"')
}

async function answerRefresh(event) {
  const request = event.request
  const url = new URL(request.url)
  const rsc = url.searchParams.get('_rsc') || ''
  const headers = rscHeaders(request.headers)
  event.waitUntil(rememberRefresh(localeOf(url.pathname), rsc, headers).catch(() => {}))
  const key = (event.clientId || '') + ' ' + refreshKey(request.url)
  const waiting = event.clientId ? early.get(key) : undefined
  if (waiting) early.delete(key)
  const fresh = waiting && Date.now() - waiting.at < ${EARLY_MS}
  if (fresh && waiting.clientId && waiting.clientId === event.clientId && waiting.rsc === rsc && sameHeaders(waiting.headers, headers)) {
    try {
      const answer = await waiting.answer
      // A redirect (a signed-out visitor, the account's language) goes through the router itself.
      if (answer.ok && !answer.redirected) return answer
    } catch {}
  }
  return fetch(request)
}

// Answers the request when it is the shell's business; false otherwise.
function shellFetch(event) {
  const request = event.request
  if (request.mode === 'navigate' && request.method === 'GET') {
    const url = new URL(request.url)
    const path = url.origin === self.location.origin ? shellPathFor(url.pathname) : null
    if (!path) return false
    event.respondWith(shellFirst(event, self.location.origin + path))
    return true
  }
  if (isShellRefresh(request)) {
    event.respondWith(answerRefresh(event))
    return true
  }
  return false
}

// The shell page, answered from the cache and in the foreground (never a background tab), asks for
// its refresh to start now. Only for /generate or /zh/generate on this site.
function shellMessage(event) {
  const data = event.data
  if (!data || data.type !== 'sv-shell-early' || typeof data.href !== 'string') return false
  let url
  try {
    url = new URL(data.href)
  } catch {
    return true
  }
  // From a window of this site, in the foreground, with an id the refresh can be matched to.
  const source = event.source
  const foreground = source && typeof source.id === 'string' && source.id && (source.visibilityState === undefined || source.visibilityState === 'visible')
  if (url.origin === self.location.origin && shellPathFor(url.pathname) && foreground) event.waitUntil(startEarly(url.href, source.id).catch(() => {}))
  return true
}

async function shellActivate() {
  try {
    if (self.registration.navigationPreload) await self.registration.navigationPreload.setHeaderValue(SHELL_PRELOAD)
  } catch {}
  await Promise.all(['/app-shell/generate', '/zh/app-shell/generate'].map((path) => refreshShell(self.location.origin + path)))
}

// A newer build is out (a page's version check, which says its own build): every other build's
// shell goes, and this worker's own only when the page is of this build too (the worker itself is
// the old one). A tab still on an older build never drops the current worker's shell.
async function dropShell(build) {
  early.clear()
  for (const key of await caches.keys()) {
    if (key.startsWith(PREFIX + 'shell-') && (key !== SHELL || build === VERSION)) await caches.delete(key)
  }
}

// Sign-out: an early answer carries the account; none may outlive the session.
function forgetEarly() {
  early.clear()
}
`

// With the shell switch off: nothing is answered from a shell, preload goes back to its default
// header, and any shell an earlier build kept is deleted on activation (sw.ts).
export const NO_SHELL = `const shellFetch = () => false
const shellMessage = () => false
async function shellActivate() {
  try {
    if (self.registration.navigationPreload) await self.registration.navigationPreload.setHeaderValue('true')
  } catch {}
}
async function dropShell() {}
function forgetEarly() {}
`
