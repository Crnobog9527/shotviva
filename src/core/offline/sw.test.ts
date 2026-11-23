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

// The generated /sw.js, run against a stand-in for the worker's globals.
function runWorker(source: string, cached: Map<string, Response> = new Map()) {
  const handlers: Record<string, (event: unknown) => void> = {}
  const deleted: string[] = []
  const store = { match: vi.fn(async (request: { url: string }) => cached.get(request.url)), put: vi.fn(async (request: { url: string }, response: Response) => void cached.set(request.url, response)), keys: vi.fn(async () => []), delete: vi.fn() }
  const caches = { open: vi.fn(async () => store), keys: vi.fn(async () => ['sv-static-old', 'sv-catalogue', 'other-app']), delete: vi.fn(async (key: string) => void deleted.push(key)) }
  const self = { location: { origin: SITE }, addEventListener: (type: string, handler: (event: unknown) => void) => void (handlers[type] = handler), skipWaiting: vi.fn(), clients: { claim: vi.fn() }, registration: { unregister: vi.fn() } }
  const fetch = vi.fn(async () => new Response('body', { status: 200 }))
  new Function('self', 'caches', 'fetch', source)(self, caches, fetch)
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    let waited: Promise<unknown> | undefined
    const full = { ...event, waitUntil: (p: Promise<unknown>) => void (waited = p), respondWith: vi.fn((p: Promise<unknown>) => void (waited = p)) }
    handlers[type]?.(full)
    await waited
    return full
  }
  return { handlers, deleted, caches, store, self, fetch, dispatch }
}

describe('/sw.js', () => {
  const source = serviceWorkerSource({ version: 'dpl_test', cdnOrigins: [CDN], enabled: true })

  it('answers a static file from the cache after the first fetch, and leaves pages alone', async () => {
    const worker = runWorker(source)
    const page = await worker.dispatch('fetch', { request: { url: `${SITE}/zh/generate`, method: 'GET', mode: 'navigate' } })
    expect(page.respondWith).not.toHaveBeenCalled()
    const api = await worker.dispatch('fetch', { request: { url: `${SITE}/api/generate/status`, method: 'GET', mode: 'cors' } })
    expect(api.respondWith).not.toHaveBeenCalled()
    const script = await worker.dispatch('fetch', { request: { url: `${CDN}/_next/static/chunks/a.js`, method: 'GET', mode: 'cors' } })
    expect(script.respondWith).toHaveBeenCalled()
    expect(worker.store.put).toHaveBeenCalledTimes(1)
  })

  it('never keeps an opaque answer', async () => {
    const worker = runWorker(source)
    worker.fetch.mockResolvedValueOnce(Object.assign(new Response(null, { status: 200 }), {}) as Response)
    const opaque = { ok: false, status: 0, type: 'opaque', clone: () => opaque } as unknown as Response
    worker.fetch.mockResolvedValueOnce(opaque)
    await worker.dispatch('fetch', { request: { url: `${SITE}/_next/static/chunks/b.js`, method: 'GET', mode: 'no-cors' } })
    await worker.dispatch('fetch', { request: { url: `${SITE}/_next/static/chunks/c.js`, method: 'GET', mode: 'no-cors' } })
    expect(worker.store.put).toHaveBeenCalledTimes(1)
  })

  it('on activation deletes the other builds’ caches, never another app’s', async () => {
    const worker = runWorker(source)
    await worker.dispatch('activate', {})
    expect(worker.deleted).toEqual(['sv-static-old'])
  })

  it('the kill switch empties its caches and unregisters, and answers nothing', async () => {
    const worker = runWorker(serviceWorkerSource({ version: 'dpl_test', cdnOrigins: [CDN], enabled: false }))
    expect(worker.handlers.fetch).toBeUndefined()
    await worker.dispatch('activate', {})
    expect(worker.deleted).toEqual(['sv-static-old', 'sv-catalogue'])
    expect(worker.self.registration.unregister).toHaveBeenCalled()
  })
})
