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
// - Personal content no later than without the shell: while answering with the shell, the worker
//   starts the RSC request the shell's router.refresh() will make (its headers recorded from the
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

// The refresh request's headers (no answer, nothing of the account: the router tree is the shell's).
async function rememberRefresh(locale, rsc, tree) {
  const templates = await readTemplates()
  if (templates[locale] && templates[locale].rsc === rsc && templates[locale].tree === tree) return
  templates[locale] = { rsc, tree }
  await (await caches.open(SHELL)).put(SHELL_TEMPLATES, new Response(JSON.stringify(templates), { headers: { 'Content-Type': 'application/json' } }))
}

// The address without its _rsc parameter, as the key an early answer waits under.
function refreshKey(href) {
  const url = new URL(href)
  url.searchParams.delete('_rsc')
  return url.pathname + '?' + url.searchParams.toString()
}

const early = new Map()
async function startEarly(href) {
  const url = new URL(href)
  const template = (await readTemplates())[localeOf(url.pathname)]
  if (!template || typeof template.rsc !== 'string' || typeof template.tree !== 'string') return
  url.searchParams.set('_rsc', template.rsc)
  const answer = fetch(url.href, { headers: { rsc: '1', 'next-router-state-tree': template.tree }, credentials: 'same-origin' })
  const key = refreshKey(url.href)
  early.set(key, { rsc: template.rsc, tree: template.tree, answer, at: Date.now() })
  setTimeout(() => early.delete(key), ${EARLY_MS})
  await answer.catch(() => null)
}

async function shellFirst(event, shellUrl) {
  let hit
  try {
    hit = await (await caches.open(SHELL)).match(shellUrl)
  } catch {}
  event.waitUntil(refreshShell(shellUrl))
  if (hit) {
    event.waitUntil(startEarly(event.request.url).catch(() => {}))
    return hit
  }
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
  const tree = request.headers.get('next-router-state-tree') || ''
  event.waitUntil(rememberRefresh(localeOf(url.pathname), rsc, tree).catch(() => {}))
  const key = refreshKey(request.url)
  const waiting = early.get(key)
  early.delete(key)
  if (waiting && waiting.rsc === rsc && waiting.tree === tree && Date.now() - waiting.at < ${EARLY_MS}) {
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

async function shellActivate() {
  try {
    if (self.registration.navigationPreload) await self.registration.navigationPreload.setHeaderValue(SHELL_PRELOAD)
  } catch {}
  await Promise.all(['/app-shell/generate', '/zh/app-shell/generate'].map((path) => refreshShell(self.location.origin + path)))
}

// A newer build is out (the page's version check): this build's shell is no longer used.
async function dropShell() {
  early.clear()
  for (const key of await caches.keys()) if (key.startsWith(PREFIX + 'shell-')) await caches.delete(key)
}
`

// With the shell switch off: nothing is answered from a shell, preload goes back to its default
// header, and any shell an earlier build kept is deleted on activation (sw.ts).
export const NO_SHELL = `const shellFetch = () => false
async function shellActivate() {
  try {
    if (self.registration.navigationPreload) await self.registration.navigationPreload.setHeaderValue('true')
  } catch {}
}
async function dropShell() {}
`
