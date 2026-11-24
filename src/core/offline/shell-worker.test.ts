import { describe, expect, it, vi } from 'vitest'

import { serviceWorkerSource } from './sw'

// Create's app shell in /sw.js (ARCHITECTURE §18.3), run against a stand-in for the worker's globals.
const SITE = 'https://shotviva.com'
const BUILD = 'dpl_test'
type Key = string | { url: string }
const keyOf = (key: Key) => (typeof key === 'string' ? key : key.url)

function runWorker(source: string) {
  const handlers: Record<string, (event: unknown) => void> = {}
  const stores = new Map<string, Map<string, Response>>()
  const storeFor = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const cached = stores.get(name)!
    return {
      match: vi.fn(async (key: Key) => cached.get(keyOf(key))?.clone()),
      put: vi.fn(async (key: Key, response: Response) => void cached.set(keyOf(key), response)),
      keys: vi.fn(async () => [...cached.keys()].map((url) => ({ url }))),
      delete: vi.fn(async (key: Key) => cached.delete(keyOf(key))),
    }
  }
  const deleted: string[] = []
  const caches = { open: vi.fn(async (name: string) => storeFor(name)), keys: vi.fn(async () => [...stores.keys()]), delete: vi.fn(async (name: string) => void (deleted.push(name), stores.delete(name))) }
  const preload = { enable: vi.fn(async () => undefined), setHeaderValue: vi.fn(async () => undefined) }
  const self = { location: { origin: SITE }, addEventListener: (type: string, handler: (event: unknown) => void) => void (handlers[type] = handler), skipWaiting: vi.fn(), clients: { claim: vi.fn() }, registration: { unregister: vi.fn(), navigationPreload: preload } }
  const fetch = vi.fn(async (input: unknown, init?: RequestInit) => network(input, init))
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
  return { stores, deleted, fetch, preload, dispatch }
}

// The network: the shell (this build's marker), a refresh answer, a page.
function network(input: unknown, init?: RequestInit): Response {
  const url = typeof input === 'string' ? input : (input as { url: string }).url
  if (url.includes('/app-shell/generate')) {
    const shell = new Response('shell', { status: 200, headers: { 'x-sv-shell': BUILD } })
    return Object.defineProperty(shell, 'type', { value: 'basic' })
  }
  if (url.includes('_rsc=')) return new Response(`rsc ${new Headers(init?.headers).get('rsc') ?? 'request'}`, { status: 200 })
  return new Response('page', { status: 200 })
}

const TREE = encodeURIComponent('["",{"children":[["locale","en","d",null],{"children":["(app)",{"children":["app-shell",{"children":["generate",{}]}]}]}]},null,"refetch"]')
const nav = (path: string) => ({ request: { url: `${SITE}${path}`, method: 'GET', mode: 'navigate', headers: new Headers() }, preloadResponse: Promise.resolve(undefined) })
const refresh = (path: string, tree = TREE) => ({ request: { url: `${SITE}${path}${path.includes('?') ? '&' : '?'}_rsc=abc`, method: 'GET', mode: 'cors', headers: new Headers({ rsc: '1', 'next-router-state-tree': tree }) } })
const early = (path: string, visibilityState = 'visible') => ({ data: { type: 'sv-shell-early', href: `${SITE}${path}` }, source: { visibilityState } })
const on = serviceWorkerSource({ version: BUILD, cdnOrigins: [], enabled: true, shell: true })

describe('the app shell (switch on)', () => {
  it('keeps both shells on activation, fetched without credentials, and answers /generate and /zh/generate with them', async () => {
    const worker = runWorker(on)
    await worker.dispatch('activate', {})
    expect(worker.fetch).toHaveBeenCalledWith(`${SITE}/app-shell/generate`, { credentials: 'omit', cache: 'no-store', redirect: 'manual' })
    expect(worker.preload.setHeaderValue).toHaveBeenCalledWith(`shell-${BUILD}`)
    expect(await (await worker.dispatch('fetch', nav('/generate?c=food'))).response?.text()).toBe('shell')
    expect(await (await worker.dispatch('fetch', nav('/zh/generate'))).response?.text()).toBe('shell')
  })

  it('never answers another page with it, and without a kept shell goes to the network', async () => {
    const worker = runWorker(on)
    for (const path of ['/zh/account', '/generate/abc', '/photos', '/login', '/zh/generates']) {
      expect(await (await worker.dispatch('fetch', nav(path))).response?.text() ?? 'browser').not.toBe('shell')
    }
    expect(await (await worker.dispatch('fetch', nav('/generate'))).response?.text()).toBe('page')
  })

  it('keeps only a shell of this build, same-origin', async () => {
    const worker = runWorker(on)
    worker.fetch.mockImplementation(async () => Object.defineProperty(new Response('old', { headers: { 'x-sv-shell': 'dpl_old' } }), 'type', { value: 'basic' }))
    await worker.dispatch('activate', {})
    worker.fetch.mockImplementation(async () => Object.defineProperty(new Response('x', { headers: { 'x-sv-shell': BUILD } }), 'type', { value: 'cors' }))
    await worker.dispatch('activate', {})
    expect(worker.stores.get(`sv-shell-${BUILD}`)?.size ?? 0).toBe(0)
  })

  it('a 204 preload (the proxy saw the shell header) is never the answer', async () => {
    const worker = runWorker(on)
    const { response } = await worker.dispatch('fetch', { ...nav('/generate'), preloadResponse: Promise.resolve(new Response(null, { status: 204 })) })
    expect(await response?.text()).toBe('page')
  })
})

describe('the shell’s refresh (personal content no later)', () => {
  it('records the refresh request’s headers, then starts the next one with the shell and hands it over once', async () => {
    const worker = runWorker(on)
    await worker.dispatch('activate', {})
    await worker.dispatch('fetch', refresh('/generate'))
    const template = await worker.stores.get(`sv-shell-${BUILD}`)?.get(`${SITE}/__sv-shell-refresh`)?.clone().json()
    expect(template).toEqual({ en: { rsc: 'abc', tree: TREE } })
    worker.fetch.mockClear()
    await worker.dispatch('fetch', nav('/generate?c=food'))
    expect(worker.fetch.mock.calls.some((call: unknown[]) => String(call[0]).includes('_rsc'))).toBe(false)
    await worker.dispatch('message', early('/generate?c=food'))
    expect(worker.fetch).toHaveBeenCalledWith(`${SITE}/generate?c=food&_rsc=abc`, { headers: { rsc: '1', 'next-router-state-tree': TREE }, credentials: 'same-origin' })
    const calls = worker.fetch.mock.calls.length
    const first = await worker.dispatch('fetch', refresh('/generate?c=food'))
    expect(await first.response?.text()).toBe('rsc 1')
    expect(worker.fetch.mock.calls.length).toBe(calls)
    await worker.dispatch('fetch', refresh('/generate?c=food'))
    expect(worker.fetch.mock.calls.length).toBe(calls + 1)
  })

  it('starts nothing for a background tab, the shell’s own address or another page', async () => {
    const worker = runWorker(on)
    await worker.dispatch('activate', {})
    await worker.dispatch('fetch', refresh('/generate'))
    worker.fetch.mockClear()
    await worker.dispatch('message', early('/generate', 'hidden'))
    await worker.dispatch('message', early('/app-shell/generate'))
    await worker.dispatch('message', early('/photos'))
    await worker.dispatch('message', { data: { type: 'sv-shell-early', href: 'https://evil.example/generate' }, source: { visibilityState: 'visible' } })
    expect(worker.fetch).not.toHaveBeenCalled()
  })

  it('never keeps the early answer in a cache, and leaves other RSC requests alone', async () => {
    const worker = runWorker(on)
    await worker.dispatch('activate', {})
    await worker.dispatch('fetch', refresh('/generate'))
    await worker.dispatch('fetch', nav('/generate'))
    await worker.dispatch('message', early('/generate'))
    await worker.dispatch('fetch', refresh('/generate'))
    const kept = [...worker.stores.values()].flatMap((store) => [...store.keys()])
    expect(kept.filter((url) => url.includes('_rsc') || url === `${SITE}/generate`)).toEqual([])
    const other = await worker.dispatch('fetch', refresh('/generate', encodeURIComponent('["",{"children":["generate"]}]')))
    expect(other.full.respondWith).not.toHaveBeenCalled()
  })
})

describe('the app shell (switch off) and dropping it', () => {
  it('off: Create goes to the network, preload is back to its default, and a kept shell is deleted', async () => {
    const worker = runWorker(serviceWorkerSource({ version: BUILD, cdnOrigins: [], enabled: true, shell: false }))
    worker.stores.set(`sv-shell-${BUILD}`, new Map([['x', new Response('shell')]]))
    await worker.dispatch('activate', {})
    expect(worker.deleted).toContain(`sv-shell-${BUILD}`)
    expect(worker.preload.setHeaderValue).toHaveBeenCalledWith('true')
    expect(await (await worker.dispatch('fetch', nav('/generate'))).response?.text()).toBe('page')
  })

  it('a newer build (sv-drop-shell) drops the shell', async () => {
    const worker = runWorker(on)
    await worker.dispatch('activate', {})
    await worker.dispatch('message', { data: 'sv-drop-shell' })
    expect(worker.deleted).toContain(`sv-shell-${BUILD}`)
    expect(await (await worker.dispatch('fetch', nav('/generate'))).response?.text()).toBe('page')
  })
})
