import { describe, expect, it } from 'vitest'

import { site } from '../src/site/site.config'
import {
  checkChildSitemap,
  checkIndexable,
  checkNoindex,
  checkNotInSitemap,
  quotableFactsIn,
  sitemapLocs,
  visibleText,
  ZH_NOINDEX_PATHS,
  type Page,
} from './seo-weekly-lib'

const ld = (offers: object[]) =>
  `<script type="application/ld+json">${JSON.stringify([{ '@type': 'SoftwareApplication', offers }])}</script>`

const FACTS = [
  'Shotviva makes each photo in about 60 seconds.',
  'Shotviva plans start at $19.90 a month for 1,990 credits.',
  'New Shotviva accounts get 100 free credits, once.',
  'Shotviva exports PNG at 1024, 2048 and 2880 px.',
  'Amazon prefers more than 1,000 px on the longest side.',
].map((fact) => `<p>${fact}</p>`).join('')

const page = (body: string, over: Partial<Page> = {}): Page => ({
  url: 'https://shotviva.com/x',
  finalUrl: 'https://shotviva.com/x',
  status: 200,
  xRobotsTag: null,
  body: `<head><meta name="robots" content="index, follow"><link rel="canonical" href="https://shotviva.com/x"></head><body>${body}</body>`,
  ...over,
})

describe('seo:weekly checks', () => {
  it('passes an indexable GEO page whose offers it shows', () => {
    const report = checkIndexable(page(FACTS + ld([{ name: 'Free', price: '0' }, { name: 'Starter Monthly', price: '19.90' }])))
    expect(report.problems).toEqual([])
    expect(report.facts).toBe(5)
  })

  it('flags an offer the page does not show, too few facts, noindex and a foreign canonical', () => {
    const bad = page(`<p>Shotviva is great.</p>${ld([{ name: 'Max Yearly', price: '891.00' }])}`, { xRobotsTag: 'noindex' })
    const problems = checkIndexable({ ...bad, body: bad.body.replace('href="https://shotviva.com/x"', 'href="https://shotviva.com/"') }).problems
    expect(problems).toEqual([
      'noindex (meta or X-Robots-Tag)',
      'canonical is https://shotviva.com/',
      '0 quotable facts, want 5+',
      'JSON-LD offer "Max Yearly" $891 is not in the page text',
    ])
  })

  it('skips the fact and offer checks on legal pages', () => {
    const legal = page('<p>Terms.</p>', { url: 'https://shotviva.com/terms', finalUrl: 'https://shotviva.com/terms' })
    expect(checkIndexable({ ...legal, body: legal.body.replace('/x"', '/terms"') }).problems).toEqual([])
  })

  it('wants app pages noindex, accepts a 404, and keeps them out of the sitemap', () => {
    expect(checkNoindex(page('', { url: 'https://shotviva.com/login', body: '<meta name="robots" content="noindex, follow">' }))).toBeNull()
    expect(checkNoindex(page('', { status: 404 }))).toBeNull()
    expect(checkNoindex(page('', { status: 405 }))).toBeNull()
    expect(checkNoindex(page('', { url: 'https://shotviva.com/photos' }))).toBe('https://shotviva.com/photos is indexable (landed on https://shotviva.com/x)')
    expect(checkNotInSitemap(['https://shotviva.com/', 'https://shotviva.com/login'], 'https://shotviva.com')).toEqual(['https://shotviva.com/login is in the sitemap'])
  })

  it('does not count $19.90 on the page as a $9.90 offer shown', () => {
    const problems = checkIndexable(page(FACTS + ld([{ name: 'Credit Pack, 990 credits', price: '9.90' }]))).problems
    expect(problems).toEqual(['JSON-LD offer "Credit Pack, 990 credits" $9.90 is not in the page text'])
  })

  it('turns a failed request into a problem line', () => {
    const failed = page('', { status: 0, body: '', error: 'timed out after 20 s' })
    expect(checkIndexable(failed).problems).toEqual(['request failed: timed out after 20 s'])
    expect(checkNoindex(failed)).toBe('https://shotviva.com/x request failed: timed out after 20 s')
    expect(checkChildSitemap(failed)).toBe('https://shotviva.com/x request failed: timed out after 20 s')
  })

  it('wants every child sitemap to answer 200 and list URLs', () => {
    const xml = (body: string, over: Partial<Page> = {}) => ({ ...page(''), url: 'https://shotviva.com/sitemap-zh.xml', body, ...over })
    expect(checkChildSitemap(xml('<urlset><url><loc>https://shotviva.com/zh</loc></url></urlset>'))).toBeNull()
    expect(checkChildSitemap(xml('<urlset></urlset>'))).toBe('https://shotviva.com/sitemap-zh.xml lists no <loc>')
    expect(checkChildSitemap(xml('', { status: 404 }))).toBe('https://shotviva.com/sitemap-zh.xml answered 404')
  })

  it('derives the Chinese noindex pages from site.indexing', () => {
    for (const path of site.indexing.zhIndexablePaths) expect(ZH_NOINDEX_PATHS).not.toContain(path === '/' ? '/zh' : `/zh${path}`)
    expect(ZH_NOINDEX_PATHS).toContain('/zh/partners')
    expect(ZH_NOINDEX_PATHS).not.toContain('/zh/commercial-photography')
    expect(ZH_NOINDEX_PATHS.some((path) => path.includes('['))).toBe(false)
  })

  it('reads sitemap locs and the visible text', () => {
    expect(sitemapLocs('<urlset><url><loc>https://shotviva.com/</loc></url><url><loc> https://shotviva.com/zh </loc></url></urlset>'))
      .toEqual(['https://shotviva.com/', 'https://shotviva.com/zh'])
    expect(visibleText('<style>.a{}</style><p>Plans &amp; packs</p><script>var x = "$99"</script>')).not.toContain('$99')
    expect(quotableFactsIn('Yes. Shotviva makes each photo in about 60 seconds. It costs $19.90 a month for 1,990 credits.'))
      .toEqual(['Shotviva makes each photo in about 60 seconds.'])
  })
})
