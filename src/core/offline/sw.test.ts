import { describe, expect, it, vi } from 'vitest'

import { routeFor } from './routes'
import { serviceWorkerSource } from './sw'

const SITE = 'https://shotviva.com'
const CDN = 'https://img-eo.shotviva.com'
const ORIGINS = [SITE, CDN]
const get = (href: string, mode = 'no-cors') => routeFor(href, 'GET', mode, ORIGINS)

describe('what the service worker answers', () => {
  it('content-hashed static files on the site or the static-file CDN', () => {
    expect(get(`${CDN}/_next/static/immutable/chunks/0x0riq27l2d5q.js`, 'cors')).toBe('static')
    expect(get(`${SITE}/_next/static/css/app.css`)).toBe('static')
    expect(get(`${CDN}/fonts/geist/geist-9b6f5ff45b278c74.woff2`, 'cors')).toBe('static')
  })

  it('the catalogue file at a version, on the site only', () => {
    expect(get(`${SITE}/api/catalogue/public/zh/0123456789abcdef`, 'cors')).toBe('catalogue')
    expect(get(`${CDN}/api/catalogue/public/zh/0123456789abcdef`, 'cors')).toBeNull()
  })

  it('never a page, never another API, never the account, admin or partner areas', () => {
    for (const href of [`${SITE}/zh`, `${SITE}/zh/generate`, `${SITE}/account`, `${SITE}/zh/account`, `${SITE}/admin/users`, `${SITE}/partners/enterprise`]) {
      expect(get(href)).toBeNull()
      expect(get(href, 'navigate')).toBeNull()
    }
    for (const href of [`${SITE}/api/catalogue/public/zh/latest`, `${SITE}/api/catalogue/public/zh/current`, `${SITE}/api/catalogue/forms`, `${SITE}/api/generate/status`, `${SITE}/api/version`, `${SITE}/api/files/x/thumb`]) {
      expect(get(href, 'cors')).toBeNull()
    }
  })

  it('never a navigation, a write, a query string or another origin', () => {
    expect(get(`${SITE}/_next/static/chunks/a.js`, 'navigate')).toBeNull()
    expect(routeFor(`${SITE}/_next/static/chunks/a.js`, 'POST', 'cors', ORIGINS)).toBeNull()
    expect(get(`${SITE}/_next/static/chunks/a.js?dpl=x`)).toBeNull()
    expect(get('https://evil.example/_next/static/chunks/a.js')).toBeNull()
    expect(get('not a url')).toBeNull()
  })
})

// The generated /sw.js, run against a stand-in for the worker's globals. `fail` makes the cache
// API reject at one step, as Cache Storage can (a quota, an eviction race, an internal error).
type Fail = 'open' | 'match' | 'put' | null
function runWorker(source: string, { fail = null as Fail, cached = new Map<string, Response>() } = {}) {
  const handlers: Record<string, (event: unknown) => void> = {}
  const deleted: string[] = []
  const reject = (step: Fail) => (fail === step ? Promise.reject(new Error(`cache ${step} failed`)) : null)
  const store = {
    match: vi.fn(async (request: { url: string }) => (await reject('match')) ?? cached.get(request.url)),
    put: vi.fn(async (request: { url: string }, response: Response) => (await reject('put')) ?? void cached.set(request.url, response)),
    keys: vi.fn(async () => []),
    delete: vi.fn(),
  }
  const caches = { open: vi.fn(async () => (await reject('open')) ?? store), keys: vi.fn(async () => ['sv-static-old', 'sv-catalogue', 'other-app']), delete: vi.fn(async (key: string) => void deleted.push(key)) }
  const preload = { enable: vi.fn(async () => undefined) }
  const self = { location: { origin: SITE }, addEventListener: (type: string, handler: (event: unknown) => void) => void (handlers[type] = handler), skipWaiting: vi.fn(), clients: { claim: vi.fn() }, registration: { unregister: vi.fn(), navigationPreload: preload } }
  const fetch = vi.fn(async () => new Response('network', { status: 200 }))
  new Function('self', 'caches', 'fetch', source)(self, caches, fetch)
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = []
    let answer: Promise<Response> | undefined
    const full = { ...event, waitUntil: (p: Promise<unknown>) => void waits.push(p), respondWith: vi.fn((p: Promise<Response>) => void (answer = p)) }
    handlers[type]?.(full)
    const response = answer ? await answer : undefined
    await Promise.all(waits)
    return { full, response }
  }
  return { handlers, deleted, caches, store, self, fetch, preload, dispatch }
}
const asset = (path: string) => ({ request: { url: `${CDN}${path}`, method: 'GET', mode: 'cors' } })

describe('/sw.js', () => {
  const source = serviceWorkerSource({ version: 'dpl_test', cdnOrigins: [CDN], enabled: true })

  it('answers a static file from the network the first time and keeps a copy after, under waitUntil', async () => {
    const worker = runWorker(source)
    const { response } = await worker.dispatch('fetch', asset('/_next/static/chunks/a.js'))
    expect(await response?.text()).toBe('network')
    expect(worker.store.put).toHaveBeenCalledTimes(1)
    const again = await worker.dispatch('fetch', asset('/_next/static/chunks/a.js'))
    expect(again.response).toBeDefined()
    expect(worker.fetch).toHaveBeenCalledTimes(1)
  })

  it.each(['open', 'match', 'put'] as const)('falls back to the network when the cache %s rejects', async (fail) => {
    const worker = runWorker(source, { fail })
    const { response } = await worker.dispatch('fetch', asset('/_next/static/chunks/b.js'))
    expect(response?.status).toBe(200)
    expect(await response?.text()).toBe('network')
  })

  it('never keeps an opaque answer', async () => {
    const worker = runWorker(source)
    const opaque = { ok: false, status: 0, type: 'opaque', clone: () => opaque } as unknown as Response
    worker.fetch.mockResolvedValueOnce(opaque)
    await worker.dispatch('fetch', { request: { url: `${SITE}/_next/static/chunks/c.js`, method: 'GET', mode: 'no-cors' } })
    expect(worker.store.put).not.toHaveBeenCalled()
  })

  it('answers a navigation from the network (the preloaded response, else a fetch), never from a cache', async () => {
    const worker = runWorker(source)
    const preloaded = new Response('preloaded page', { status: 200 })
    const nav = await worker.dispatch('fetch', { request: { url: `${SITE}/zh/generate`, method: 'GET', mode: 'navigate' }, preloadResponse: Promise.resolve(preloaded) })
    expect(await nav.response?.text()).toBe('preloaded page')
    const plain = await worker.dispatch('fetch', { request: { url: `${SITE}/zh/account`, method: 'GET', mode: 'navigate' }, preloadResponse: Promise.resolve(undefined) })
    expect(await plain.response?.text()).toBe('network')
    expect(worker.caches.open).not.toHaveBeenCalled()
    expect(worker.store.match).not.toHaveBeenCalled()
  })

  it('leaves a signed-in API request to the browser: no answer, no cache', async () => {
    const worker = runWorker(source)
    const api = await worker.dispatch('fetch', { request: { url: `${SITE}/api/generate/status`, method: 'GET', mode: 'cors' } })
    expect(api.full.respondWith).not.toHaveBeenCalled()
    expect(worker.caches.open).not.toHaveBeenCalled()
  })

  it('on activation turns on navigation preload and deletes the other builds’ caches, never another app’s', async () => {
    const worker = runWorker(source)
    await worker.dispatch('activate', {})
    expect(worker.preload.enable).toHaveBeenCalled()
    expect(worker.deleted).toEqual(['sv-static-old'])
  })

  it('switched off (the admin switch, also the kill switch) it empties its caches and unregisters, and answers nothing', async () => {
    const worker = runWorker(serviceWorkerSource({ version: 'dpl_test', cdnOrigins: [CDN], enabled: false }))
    expect(worker.handlers.fetch).toBeUndefined()
    await worker.dispatch('activate', {})
    expect(worker.deleted).toEqual(['sv-static-old', 'sv-catalogue'])
    expect(worker.self.registration.unregister).toHaveBeenCalled()
  })
})
