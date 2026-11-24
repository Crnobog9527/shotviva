import { beforeEach, describe, expect, it, vi } from 'vitest'

import { reportVital, resetSentVitalsForTest, VITALS_ENDPOINT, watchRestores } from './browser'

function fakeWindow(path: string, { cookie = '', fetchThrows = false } = {}) {
  const fetch = vi.fn(() => {
    if (fetchThrows) throw new TypeError('keepalive unsupported')
    return Promise.resolve(new Response(null, { status: 204 }))
  })
  const sendBeacon = vi.fn(() => true)
  const win = {
    location: { href: `https://shotviva.com${path}` },
    document: { cookie },
    matchMedia: () => ({ matches: false }),
    navigator: { serviceWorker: { controller: {} }, connection: { effectiveType: '3g' }, sendBeacon, userAgent: 'Secret UA' },
    fetch,
  } as unknown as Window
  return { win, fetch, sendBeacon }
}

const lcp = { name: 'LCP', value: 900.4, rating: 'good', navigationType: 'navigate', id: 'v5-1', navigationId: 'n1' }

beforeEach(() => resetSentVitalsForTest())

describe('reportVital', () => {
  it('posts the numbers only, without cookies, once per metric and page load', () => {
    const { win, fetch } = fakeWindow('/zh/photos/123?token=abc', { cookie: 'sb=secret' })
    reportVital(lcp, win)
    reportVital({ ...lcp, value: 950 }, win)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(VITALS_ENDPOINT)
    expect(init).toMatchObject({ method: 'POST', keepalive: true, credentials: 'omit' })
    expect(JSON.parse(init.body as string)).toEqual({ metric: 'LCP', value: 900, rating: 'good', route: 'photos', locale: 'zh', nav: 'navigate', standalone: false, sw: true, net: '3g' })
    expect(init.body).not.toMatch(/123|token|abc|secret|UA/)
  })

  it('reports each bfcache restore once, also where navigationId is 0 (Safari, Firefox)', () => {
    const { win, fetch } = fakeWindow('/generate')
    const listeners: Array<(event: Event) => void> = []
    win.addEventListener = ((type: string, listener: (event: Event) => void) => {
      if (type === 'pageshow') listeners.push(listener)
    }) as Window['addEventListener']
    watchRestores(win)
    watchRestores(win)
    const restore = () => listeners.forEach((listener) => listener({ persisted: true } as unknown as Event))
    const first = { ...lcp, navigationId: 0 }
    const restored = { ...first, navigationType: 'back-forward-cache' }
    reportVital(first, win)
    reportVital(first, win)
    restore()
    reportVital(restored, win)
    reportVital(restored, win)
    restore()
    reportVital(restored, win)
    listeners.forEach((listener) => listener({ persisted: false } as unknown as Event))
    reportVital(restored, win)
    const navs = fetch.mock.calls.map((call) => JSON.parse((call as unknown as [string, RequestInit])[1].body as string).nav)
    expect(navs).toEqual(['navigate', 'back-forward', 'back-forward'])
  })

  it('falls back to sendBeacon when keepalive fetch throws', () => {
    const { win, sendBeacon } = fakeWindow('/generate', { fetchThrows: true })
    reportVital(lcp, win)
    expect(sendBeacon).toHaveBeenCalledWith(VITALS_ENDPOINT, expect.stringContaining('"route":"generate"'))
  })

  it('sends nothing for pages outside the app roots', () => {
    const { win, fetch } = fakeWindow('/admin/users')
    reportVital(lcp, win)
    expect(fetch).not.toHaveBeenCalled()
  })
})
