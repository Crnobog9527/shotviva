import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

import { crawlerHitOf, reportCrawlerHit } from './crawler'

const GPT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot'
const request = (path: string, ua: string | null, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(`https://shotviva.com${path}`, { method: init.method, headers: { ...(ua ? { 'user-agent': ua } : {}), ...init.headers } })
const env = { PVUV_SITE: 'site_1', PVUV_INGEST_TOKEN: 'secret-token' }

describe('crawlerHitOf', () => {
  it('takes an AI crawler fetching a page, with the first forwarded address', () => {
    const hit = crawlerHitOf(request('/pricing?x=1', GPT, { headers: { 'x-forwarded-for': '20.1.2.3, 10.0.0.1' } }), 5)
    expect(hit).toEqual({ ua: GPT, path: '/pricing', ip: '20.1.2.3', ts: 5 })
  })

  it.each([
    ['a browser', request('/', 'Mozilla/5.0 Chrome/130 Safari/537.36')],
    ['no user agent', request('/', null)],
    ['a POST', request('/', GPT, { method: 'POST' })],
    ['an API route', request('/api/health', GPT)],
    ['a Next internal path', request('/_vercel/insights/view', GPT)],
    ['an image', request('/home/hero.webp', GPT)],
  ])('ignores %s', (_, req) => {
    expect(crawlerHitOf(req)).toBeNull()
  })

  it('counts extension-less, .html, .txt, .xml and .md paths as pages', () => {
    for (const path of ['/zh/pricing', '/index.html', '/llms.txt', '/sitemap.xml', '/blog/post.md']) {
      expect(crawlerHitOf(request(path, GPT))?.path).toBe(path)
    }
  })
})

describe('reportCrawlerHit', () => {
  it('posts after the response through waitUntil, with the ingest token', async () => {
    const waits: Promise<unknown>[] = []
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    reportCrawlerHit(request('/', GPT), { waitUntil: (p) => void waits.push(p) }, () => env, fetcher)
    expect(waits).toHaveLength(1)
    await Promise.all(waits)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.pvuv.ai/v1/sites/site_1/crawler_hits')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-token')
    expect(JSON.parse(init.body as string).hits[0]).toMatchObject({ ua: GPT, path: '/' })
  })

  it('does nothing for a browser, without configuration, or without an event', () => {
    const waitUntil = vi.fn()
    const fetcher = vi.fn()
    reportCrawlerHit(request('/', 'Chrome/130'), { waitUntil }, () => env, fetcher)
    reportCrawlerHit(request('/', GPT), { waitUntil }, () => ({ PVUV_SITE: 'site_1' }), fetcher)
    reportCrawlerHit(request('/', GPT), { waitUntil }, () => ({}), fetcher)
    reportCrawlerHit(request('/', GPT), undefined, () => env, fetcher)
    expect(waitUntil).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('never throws: a bad environment, a failing fetch or a failing waitUntil', async () => {
    expect(() => reportCrawlerHit(request('/', GPT), { waitUntil: vi.fn() }, () => { throw new Error('bad env') })).not.toThrow()
    expect(() => reportCrawlerHit(request('/', GPT), { waitUntil: () => { throw new Error('x') } }, () => env, vi.fn())).not.toThrow()
    const waits: Promise<unknown>[] = []
    reportCrawlerHit(request('/', GPT), { waitUntil: (p) => void waits.push(p) }, () => env, vi.fn().mockRejectedValue(new Error('down')))
    await expect(Promise.all(waits)).resolves.toBeDefined()
  })
})
