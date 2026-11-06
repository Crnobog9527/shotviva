import { connection } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

import { parseServerEnv } from '../env'
import { canonicalHostRedirect } from './canonical-host'
import { PRELAUNCH_BLOCKED_CRAWLERS } from './crawlers'
import { indexablePaths, isIndexable, NOINDEX } from './indexing'
import { indexingOpen, noindexForHost, parseIndexingEnv, xRobotsTagRules } from './indexing-env'
import { closedSeoFileResponse, indexingOpenNow } from './indexing-now'
import { llmsTxt } from './llms-txt'
import { pageMetadata } from './metadata'
import { robotsRules } from './robots'
import { pageSitemapUrls } from './sitemap'
import { testSite } from './test-site'

// Request-time marker only; outside Next it has no request to wait for.
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<object>()), connection: vi.fn(async () => {}) }))

// ARCHITECTURE §12.0. No switch mock here: the test process has no SITE_INDEXING and no VERCEL_ENV,
// which is exactly the default every deployment starts from.
const site = testSite()

describe('SITE_INDEXING switch', () => {
  it('defaults to off, treats blank as unset and opens only for on + production', () => {
    expect(parseIndexingEnv({}).SITE_INDEXING).toBe('off')
    expect(parseIndexingEnv({ SITE_INDEXING: '' }).SITE_INDEXING).toBe('off')
    expect(indexingOpen(parseIndexingEnv({}))).toBe(false)
    expect(indexingOpen(parseIndexingEnv({ SITE_INDEXING: 'on', VERCEL_ENV: 'production' }))).toBe(true)
    expect(indexingOpen(parseIndexingEnv({ SITE_INDEXING: 'off', VERCEL_ENV: 'production' }))).toBe(false)
  })

  it('stays closed on previews and local runs even when set to on', () => {
    expect(indexingOpen(parseIndexingEnv({ SITE_INDEXING: 'on', VERCEL_ENV: 'preview' }))).toBe(false)
    expect(indexingOpen(parseIndexingEnv({ SITE_INDEXING: 'on', VERCEL_ENV: 'development' }))).toBe(false)
    expect(indexingOpen(parseIndexingEnv({ SITE_INDEXING: 'on' }))).toBe(false)
  })

  it('rejects any other value at startup (build config and server env)', () => {
    for (const value of ['true', 'ON', 'yes', '1']) {
      expect(() => parseIndexingEnv({ SITE_INDEXING: value })).toThrow(/SITE_INDEXING/)
      expect(() => parseServerEnv({ SITE_INDEXING: value })).toThrow(/SITE_INDEXING/)
    }
    expect(parseServerEnv({}).SITE_INDEXING).toBe('off')
  })
})

describe('closed site (the default)', () => {
  it('is closed in this process', () => {
    expect(indexingOpenNow()).toBe(false)
  })

  it('makes every path noindex, nofollow and lists nothing', () => {
    for (const path of ['/', '/image-to-image-generator', '/generate', '/pricing', '/zh']) {
      expect(isIndexable(site, path)).toBe(false)
      expect(pageMetadata(site, { path, title: 'T', description: 'D' }).robots).toEqual(NOINDEX)
    }
    expect(indexablePaths(site)).toEqual([])
    expect(pageSitemapUrls(site)).toEqual([])
    expect(llmsTxt(site, 'S.', [{ path: '/', title: 'Home', description: 'D' }])).not.toContain('](')
  })

  it('robots.txt lets everyone fetch, disallows every AI crawler and has no Sitemap or Host', () => {
    const robots = robotsRules(site)
    expect(robots.rules).toEqual([
      { userAgent: '*', allow: '/' },
      { userAgent: [...PRELAUNCH_BLOCKED_CRAWLERS], disallow: '/' },
    ])
    expect(PRELAUNCH_BLOCKED_CRAWLERS).toHaveLength(14)
    expect(robots.sitemap).toBeUndefined()
    expect(robots.host).toBeUndefined()
  })

  it('answers sitemap and llms.txt routes with a noindex 404 at request time', async () => {
    const response = await closedSeoFileResponse()
    // Not prerendered: Vercel served a prerendered /sitemap.xml 404 as a static 200.
    expect(connection).toHaveBeenCalled()
    expect(response?.status).toBe(404)
    expect(response?.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    expect(await response?.text()).toBe('Not Found')
  })
})

describe('X-Robots-Tag rules', () => {
  const header = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]

  it('covers every response while closed, every non-canonical host once open', () => {
    expect(xRobotsTagRules(false, 'shotviva.com')).toEqual([{ source: '/:path*', headers: header }])
    expect(xRobotsTagRules(true, 'shotviva.com')).toEqual([
      { source: '/:path*', missing: [{ type: 'host', value: 'shotviva\\.com' }], headers: header },
    ])
  })

  it('decides the same per host in the proxy', () => {
    expect(noindexForHost(false, 'shotviva.com', 'shotviva.com')).toBe(true)
    expect(noindexForHost(true, 'shotviva.com', 'shotviva.com')).toBe(false)
    expect(noindexForHost(true, 'shotviva.vercel.app', 'shotviva.com')).toBe(true)
    expect(noindexForHost(true, null, 'shotviva.com')).toBe(true)
  })
})

describe('canonical host redirect', () => {
  const bound = {
    host: 'shotviva.vercel.app',
    vercelEnv: 'production',
    appOrigin: 'https://shotviva.com',
    canonicalHost: 'shotviva.com',
    redirectHosts: ['shotviva.vercel.app'],
  }

  it('308s production vercel.app to the domain, keeping path and query', () => {
    expect(canonicalHostRedirect(bound, '/pricing?x=1')).toBe('https://shotviva.com/pricing?x=1')
  })

  it('does nothing before the domain is configured (NEXT_PUBLIC_SITE_URL not shotviva.com)', () => {
    expect(canonicalHostRedirect({ ...bound, appOrigin: 'https://shotviva.vercel.app' }, '/')).toBeNull()
  })

  it('does nothing outside production, on the domain itself or on unlisted hosts', () => {
    expect(canonicalHostRedirect({ ...bound, vercelEnv: 'preview' }, '/')).toBeNull()
    expect(canonicalHostRedirect({ ...bound, vercelEnv: undefined }, '/')).toBeNull()
    expect(canonicalHostRedirect({ ...bound, host: 'shotviva.com' }, '/')).toBeNull()
    expect(canonicalHostRedirect({ ...bound, host: 'shotviva-abc123-team.vercel.app' }, '/')).toBeNull()
    expect(canonicalHostRedirect({ ...bound, host: null }, '/')).toBeNull()
  })
})
