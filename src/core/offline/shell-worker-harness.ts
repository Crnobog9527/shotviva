import { vi } from 'vitest'

import { serviceWorkerSource } from './sw'

// Create's app shell in /sw.js (ARCHITECTURE §18.3), run against a stand-in for the worker's globals.
export const SITE = 'https://shotviva.com'
export const BUILD = 'dpl_test'
type Key = string | { url: string }
const keyOf = (key: Key) => (typeof key === 'string' ? key : key.url)

// `stores`: Cache Storage as another run of the worker left it (the browser stopped and restarted it).
export function runWorker(source: string, stores = new Map<string, Map<string, Response>>()) {
  const handlers: Record<string, (event: unknown) => void> = {}
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
  const caches = { has: vi.fn(async (name: string) => stores.has(name)), open: vi.fn(async (name: string) => storeFor(name)), keys: vi.fn(async () => [...stores.keys()]), delete: vi.fn(async (name: string) => void (deleted.push(name), stores.delete(name))) }
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
  return { stores, deleted, caches, fetch, preload, dispatch }
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

export const nav = (path: string) => ({ request: { url: `${SITE}${path}`, method: 'GET', mode: 'navigate', headers: new Headers() }, preloadResponse: Promise.resolve(undefined) })
export const on = serviceWorkerSource({ version: BUILD, cdnOrigins: [], enabled: true, shell: true })
