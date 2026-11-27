import { describe, expect, it, vi } from 'vitest'

import { serviceWorkerSource } from './sw'
import { BUILD, SITE, nav, on, runWorker } from './shell-worker-harness'

// Create's app shell in /sw.js (ARCHITECTURE §18.3), run against a stand-in for the worker's globals.

const TREE = encodeURIComponent('["",{"children":[["locale","en","d",null],{"children":["(app)",{"children":["app-shell",{"children":["generate",{}]}]}]}]},null,"refetch"]')
const refresh = (path: string, { tree = TREE, client = 'tab-1', deployment = BUILD } = {}) => ({ clientId: client, request: { url: `${SITE}${path}${path.includes('?') ? '&' : '?'}_rsc=abc`, method: 'GET', mode: 'cors', headers: new Headers({ rsc: '1', 'next-router-state-tree': tree, 'x-deployment-id': deployment }) } })
const early = (path: string, visibilityState = 'visible', id = 'tab-1') => ({ data: { type: 'sv-shell-early', href: `${SITE}${path}` }, source: { visibilityState, id } })

describe('the app shell (switch on)', () => {
  it('keeps both shells on install, fetched without credentials, and answers /generate and /zh/generate with them', async () => {
    const worker = runWorker(on)
    await worker.dispatch('install', {})
    await worker.dispatch('activate', {})
    expect(worker.fetch).toHaveBeenCalledWith(`${SITE}/app-shell/generate`, expect.objectContaining({ credentials: 'omit', cache: 'no-store', redirect: 'manual', signal: expect.anything() }))
    expect(worker.preload.setHeaderValue).toHaveBeenCalledWith(`shell-${BUILD}`)
    expect(await (await worker.dispatch('fetch', nav('/generate?c=food'))).response?.text()).toBe('shell')
    expect(await (await worker.dispatch('fetch', nav('/zh/generate'))).response?.text()).toBe('shell')
  })

  it('never answers another page with it, and without a kept shell goes to the network', async () => {
    const worker = runWorker(on)
    for (const path of ['/zh/account', '/generate/abc', '/photos', '/login', '/zh/generates']) {
      expect(await (await worker.dispatch('fetch', nav(path))).response?.text() ?? 'browser').not.toBe('shell')
    }
    // A worker whose first navigation is Create, with nothing kept: the network answers.
    expect(await (await runWorker(on).dispatch('fetch', nav('/generate'))).response?.text()).toBe('page')
  })

  it('keeps only a shell of this build, same-origin', async () => {
    const worker = runWorker(on)
    worker.fetch.mockImplementation(async () => Object.defineProperty(new Response('old', { headers: { 'x-sv-shell': 'dpl_old' } }), 'type', { value: 'basic' }))
    await worker.dispatch('install', {})
    worker.fetch.mockImplementation(async () => Object.defineProperty(new Response('x', { headers: { 'x-sv-shell': BUILD } }), 'type', { value: 'cors' }))
    await worker.dispatch('install', {})
    expect(worker.stores.get(`sv-shell-${BUILD}`)?.size ?? 0).toBe(0)
  })

  it('a 204 preload (the proxy saw the shell header) is never the answer', async () => {
    const worker = runWorker(on)
    const { response } = await worker.dispatch('fetch', { ...nav('/generate'), preloadResponse: Promise.resolve(new Response(null, { status: 204 })) })
    expect(await response?.text()).toBe('page')
  })

  it('never answers the way out (sv-net) with the shell, nor with an empty 204 preload (Part B 2026-11-27)', async () => {
    const worker = runWorker(on)
    await worker.dispatch('install', {})
    await worker.dispatch('activate', {})
    expect(await (await worker.dispatch('fetch', nav('/generate'))).response?.text()).toBe('shell')
    for (const path of ['/generate?sv-net=1', '/zh/generate?c=food&sv-net=1']) {
      const { response } = await worker.dispatch('fetch', { ...nav(path), preloadResponse: Promise.resolve(new Response(null, { status: 204 })) })
      expect(await response?.text()).toBe('page')
    }
    const preloaded = await worker.dispatch('fetch', { ...nav('/generate?sv-net=1'), preloadResponse: Promise.resolve(new Response('preloaded page')) })
    expect(await preloaded.response?.text()).toBe('preloaded page')
  })
})

describe('the app shell never holds up activation (2026-11-28)', () => {
  it('activation never touches the network: a stalled shell fetch holds up neither activation nor any request (2026-11-28)', async () => {
    vi.useFakeTimers()
    try {
      const worker = runWorker(on)
      // A shell fetch that never answers (only the time limit's abort ends it); pages answer.
      worker.fetch.mockImplementation((input: unknown, init?: RequestInit) =>
        String(typeof input === 'string' ? input : (input as { url: string }).url).includes('/app-shell/')
          ? new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
          : Promise.resolve(new Response('page', { status: 200 })),
      )
      await worker.dispatch('activate', {})
      expect(worker.fetch).not.toHaveBeenCalled()
      const navigated = worker.dispatch('fetch', nav('/zh/generate'))
      await vi.advanceTimersByTimeAsync(20_000)
      const { response } = await navigated
      expect(await response?.text()).toBe('page')
    } finally {
      vi.useRealTimers()
    }
  })

  it('a shell the replaced worker deleted after install is fetched again behind the first navigation, once', async () => {
    const worker = runWorker(on)
    await worker.dispatch('install', {})
    worker.stores.get(`sv-shell-${BUILD}`)?.delete(`${SITE}/zh/app-shell/generate`)
    await worker.dispatch('activate', {})
    const shellFetches = () => worker.fetch.mock.calls.map(([input]) => input).filter((input) => typeof input === 'string' && input.includes('/app-shell/'))
    worker.fetch.mockClear()
    await worker.dispatch('fetch', nav('/photos'))
    expect(shellFetches()).toEqual([`${SITE}/zh/app-shell/generate`])
    expect(await (await worker.dispatch('fetch', nav('/zh/generate'))).response?.text()).toBe('shell')
    worker.fetch.mockClear()
    await worker.dispatch('fetch', nav('/photos'))
    expect(shellFetches()).toEqual([])
  })

  it('a shell fetch that never answers is given up after its time limit, so install ends', async () => {
    vi.useFakeTimers()
    try {
      const worker = runWorker(on)
      worker.fetch.mockImplementation((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))))
      const installed = worker.dispatch('install', {})
      await vi.advanceTimersByTimeAsync(20_000)
      await installed
      expect(worker.stores.has(`sv-shell-${BUILD}`)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the shell’s refresh (personal content no later)', () => {
  it('records the refresh request’s headers, then starts the next one with the shell and hands it over once', async () => {
    const worker = runWorker(on)
    await worker.dispatch('install', {})
    await worker.dispatch('activate', {})
    await worker.dispatch('fetch', refresh('/generate'))
    const template = await worker.stores.get(`sv-shell-${BUILD}`)?.get(`${SITE}/__sv-shell-refresh`)?.clone().json()
    expect(template).toEqual({ en: { rsc: 'abc', headers: { rsc: '1', 'next-router-state-tree': TREE, 'x-deployment-id': BUILD } } })
    worker.fetch.mockClear()
    await worker.dispatch('fetch', nav('/generate?c=food'))
    expect(worker.fetch.mock.calls.some((call: unknown[]) => String(call[0]).includes('_rsc'))).toBe(false)
    await worker.dispatch('message', early('/generate?c=food'))
    expect(worker.fetch).toHaveBeenCalledWith(`${SITE}/generate?c=food&_rsc=abc`, { headers: { rsc: '1', 'next-router-state-tree': TREE, 'x-deployment-id': BUILD }, credentials: 'same-origin' })
    const calls = worker.fetch.mock.calls.length
    const first = await worker.dispatch('fetch', refresh('/generate?c=food'))
    expect(await first.response?.text()).toBe('rsc 1')
    expect(worker.fetch.mock.calls.length).toBe(calls)
    await worker.dispatch('fetch', refresh('/generate?c=food'))
    expect(worker.fetch.mock.calls.length).toBe(calls + 1)
  })

  it('starts nothing for a background tab, the shell’s own address or another page', async () => {
    const worker = runWorker(on)
    await worker.dispatch('install', {})
    await worker.dispatch('activate', {})
    await worker.dispatch('fetch', refresh('/generate'))
    worker.fetch.mockClear()
    await worker.dispatch('message', early('/generate', 'hidden'))
    await worker.dispatch('message', early('/app-shell/generate'))
    await worker.dispatch('message', early('/photos'))
    await worker.dispatch('message', { data: { type: 'sv-shell-early', href: 'https://evil.example/generate' }, source: { visibilityState: 'visible', id: 'tab-1' } })
    await worker.dispatch('message', { data: { type: 'sv-shell-early', href: `${SITE}/generate` }, source: null })
    expect(worker.fetch).not.toHaveBeenCalled()
  })

})

describe('the early answer stays with one window and one deployment', () => {
  it('hands the early answer only to the window that asked, and to no one after sign-out', async () => {
    const worker = runWorker(on)
    await worker.dispatch('install', {})
    await worker.dispatch('activate', {})
    await worker.dispatch('fetch', refresh('/generate'))
    await worker.dispatch('message', early('/generate', 'visible', 'tab-1'))
    const calls = worker.fetch.mock.calls.length
    await worker.dispatch('fetch', refresh('/generate', { client: 'tab-2' }))
    expect(worker.fetch.mock.calls.length).toBe(calls + 1)
    await worker.dispatch('message', { data: 'sv-clear' })
    await worker.dispatch('fetch', refresh('/generate', { client: 'tab-1' }))
    expect(worker.fetch.mock.calls.length).toBe(calls + 2)
  })

  it('keeps each window’s early answer apart: a second window never takes or replaces the first one’s', async () => {
    const worker = runWorker(on)
    await worker.dispatch('install', {})
    await worker.dispatch('activate', {})
    await worker.dispatch('fetch', refresh('/generate'))
    await worker.dispatch('message', early('/generate', 'visible', 'tab-1'))
    await worker.dispatch('message', early('/generate', 'visible', 'tab-2'))
    const calls = worker.fetch.mock.calls.length
    await worker.dispatch('fetch', refresh('/generate', { client: 'tab-1' }))
    await worker.dispatch('fetch', refresh('/generate', { client: 'tab-2' }))
    expect(worker.fetch.mock.calls.length).toBe(calls)
  })

  it('never hands over an early answer pinned to another deployment', async () => {
    const worker = runWorker(on)
    await worker.dispatch('install', {})
    await worker.dispatch('activate', {})
    await worker.dispatch('fetch', refresh('/generate'))
    await worker.dispatch('message', early('/generate'))
    const calls = worker.fetch.mock.calls.length
    await worker.dispatch('fetch', refresh('/generate', { deployment: 'dpl_new' }))
    expect(worker.fetch.mock.calls.length).toBe(calls + 1)
  })

  it('never keeps the early answer in a cache, and leaves other RSC requests alone', async () => {
    const worker = runWorker(on)
    await worker.dispatch('install', {})
    await worker.dispatch('activate', {})
    await worker.dispatch('fetch', refresh('/generate'))
    await worker.dispatch('fetch', nav('/generate'))
    await worker.dispatch('message', early('/generate'))
    await worker.dispatch('fetch', refresh('/generate'))
    const kept = [...worker.stores.values()].flatMap((store) => [...store.keys()])
    expect(kept.filter((url) => url.includes('_rsc') || url === `${SITE}/generate`)).toEqual([])
    const other = await worker.dispatch('fetch', refresh('/generate', { tree: encodeURIComponent('["",{"children":["generate"]}]') }))
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

  it('off: a shell the replaced worker kept after this one activated goes on the next navigation (Part B Step 13)', async () => {
    const worker = runWorker(serviceWorkerSource({ version: BUILD, cdnOrigins: [], enabled: true, shell: false }))
    await worker.dispatch('activate', {})
    worker.stores.set(`sv-shell-${BUILD}`, new Map([['x', new Response('shell')]]))
    expect(await (await worker.dispatch('fetch', nav('/'))).response?.text()).toBe('page')
    expect(worker.stores.has(`sv-shell-${BUILD}`)).toBe(false)
  })

  it('on: opening Create without a kept shell creates no empty shell cache before the refresh', async () => {
    const worker = runWorker(on)
    worker.fetch.mockImplementation(async () => new Response('page', { status: 200 }))
    expect(await (await worker.dispatch('fetch', nav('/generate'))).response?.text()).toBe('page')
    expect(worker.stores.has(`sv-shell-${BUILD}`)).toBe(false)
  })

  it('a newer build (sv-drop-shell) drops older shells, and this worker’s own only when it is the old one', async () => {
    const worker = runWorker(on)
    await worker.dispatch('install', {})
    await worker.dispatch('activate', {})
    worker.stores.set('sv-shell-dpl_old', new Map())
    // A tab still on an older build: only other builds' shells go, never this worker's.
    await worker.dispatch('message', { data: { type: 'sv-drop-shell', build: 'dpl_old' } })
    expect(worker.deleted).toEqual(['sv-shell-dpl_old'])
    expect(await (await worker.dispatch('fetch', nav('/generate'))).response?.text()).toBe('shell')
    // A page of this worker's own build: the worker itself is the old one.
    await worker.dispatch('message', { data: { type: 'sv-drop-shell', build: BUILD } })
    expect(worker.deleted).toContain(`sv-shell-${BUILD}`)
    expect(await (await worker.dispatch('fetch', nav('/generate'))).response?.text()).toBe('page')
  })
})
