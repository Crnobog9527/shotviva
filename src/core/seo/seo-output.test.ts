import { describe, expect, it, vi } from 'vitest'

import { breadcrumbListLd, organizationLd, serializeJsonLd, softwareApplicationLd } from './json-ld'
import { llmsTxt } from './llms-txt'
import { appShellMetadata, pageMetadata } from './metadata'
import { AI_CRAWLERS, PRIVATE_PATHS, robotsRules } from './robots'
import { testSite } from './test-site'

// These cases describe the open site (SITE_INDEXING=on in production); the closed, pre-launch
// state is covered in prelaunch.test.ts.
vi.mock('./indexing-now', () => ({ indexingOpenNow: () => true }))

const site = testSite()
const page = { path: '/', title: 'T', description: 'D' }

describe('robots', () => {
  // SEO patch v5 item 3: everyone may fetch but the private routes; the AI crawlers are named and
  // allowed; Bytespider is out; Sitemap stays; no Host line.
  it('allows every named AI crawler, blocks only private routes and Bytespider, no Host line', () => {
    const rules = [robotsRules(site).rules].flat()
    for (const bot of AI_CRAWLERS) {
      expect(rules).toContainEqual({ userAgent: bot, allow: '/' })
    }
    expect(rules).toContainEqual({ userAgent: '*', allow: '/', disallow: [...PRIVATE_PATHS] })
    expect(rules).toContainEqual({ userAgent: 'Bytespider', disallow: '/' })
    const everyoneElse = rules.filter((rule) => rule.userAgent !== 'Bytespider')
    expect(everyoneElse.flatMap((rule) => [rule.disallow ?? []].flat())).not.toContain('/')
    for (const open of ['/_next/', '/login', '/signup', '/generate', '/wishlist', '/assets/', '/cases/']) {
      expect(PRIVATE_PATHS.some((path) => open.startsWith(path))).toBe(false)
    }
    expect(robotsRules(site).sitemap).toBe('https://example.com/sitemap.xml')
    expect(robotsRules(site).host).toBeUndefined()
  })
})

describe('metadata', () => {
  // Once open, pages left out of the index still pass their links on (SEO launch handbook G8).
  it('indexes listed pages with a self canonical and noindexes the rest, links followed', () => {
    expect(pageMetadata(site, page).robots).toEqual({ index: true, follow: true })
    expect(pageMetadata(site, page).alternates?.canonical).toBe('https://example.com/')
    expect(pageMetadata(site, { ...page, path: '/pricing' }).robots).toEqual({
      index: false,
      follow: true,
    })
    expect(appShellMetadata().robots).toEqual({ index: false, follow: true })
  })

  it('shares one 1200×630 card as og:image and twitter:image', () => {
    const meta = pageMetadata(site, page)
    const card = { url: 'https://example.com/og.jpg', width: 1200, height: 630, alt: 'Example share card' }
    expect(meta.openGraph?.images).toEqual([card])
    expect(meta.twitter?.images).toEqual([card])
  })
})

describe('metadata in two languages (建站规格 §6.1, LAUNCH §7.6)', () => {
  it('gives every /zh page its own canonical and hreflang en / zh-Hans / x-default', () => {
    const zh = pageMetadata(site, page, 'zh')
    expect(zh.alternates?.canonical).toBe('https://example.com/zh')
    const languages = {
      en: 'https://example.com/',
      'zh-Hans': 'https://example.com/zh',
      'x-default': 'https://example.com/',
    }
    expect(zh.alternates?.languages).toEqual(languages)
    expect(pageMetadata(site, page).alternates?.languages).toEqual(languages)
  })

  it('indexes only the Chinese keyword map pages under /zh', () => {
    expect(pageMetadata(site, page, 'zh').robots).toEqual({ index: true, follow: true })
    // /generate is indexable in English and translated, but not in zhIndexablePaths.
    expect(pageMetadata(site, { ...page, path: '/generate' }, 'zh').robots).toEqual({ index: false, follow: true })
  })

  it('emits no hreflang when the Chinese twin is noindex (ARCHITECTURE §17)', () => {
    // /generate has a /zh version but only /zh is indexable in Chinese on the test site.
    expect(pageMetadata(site, { ...page, path: '/generate' }).alternates?.languages).toBeUndefined()
    expect(pageMetadata(site, { ...page, path: '/generate' }, 'zh').alternates?.languages).toBeUndefined()
  })

  it('emits no hreflang on an English-only page', () => {
    const terms = pageMetadata(site, { ...page, path: '/terms' })
    expect(terms.alternates?.languages).toBeUndefined()
    expect(terms.alternates?.canonical).toBe('https://example.com/terms')
  })
})

describe('json-ld', () => {
  it('names offers the way the pricing page does, never by product id', () => {
    const site = testSite()
    const withPlan = { ...site, billing: { ...site.billing, products: [{ id: 'starter_monthly', tier: 'starter', interval: 'month', credits: 1990, paidDays: 30, priceUsd: 19.9 }] } } as typeof site
    const offers = softwareApplicationLd(withPlan, page, withPlan.billing.products).offers as { name: string }[]
    expect(offers.map((o) => o.name)).toEqual(['Free', 'Starter Monthly'])
  })

  it('publishes the free offer and only decided prices', () => {
    const offers = softwareApplicationLd(site, page, site.billing.products).offers as { name: string; price: string }[]
    expect(offers.map((o) => [o.name, o.price])).toEqual([
      ['Free', '0'],
      ['Credit Pack, 120 credits', '49.00'],
    ])
  })

  it('uses the site wording for the free offer and counts paid offers in credits', () => {
    const offers = softwareApplicationLd(site, page, site.billing.products, '3 free Standard images').offers as { description: string }[]
    expect(offers.map((o) => o.description)).toEqual(['3 free Standard images', '120 credits'])
    const fallback = softwareApplicationLd(site, page, site.billing.products).offers as { description: string }[]
    expect(fallback[0]?.description).toBe(`${site.billing.freeCredits} free credits`)
  })

  it('builds organization and breadcrumbs from config', () => {
    expect(organizationLd(site)).toMatchObject({
      name: 'Example',
      legalName: 'Example LLC',
      url: 'https://example.com/',
      address: { '@type': 'PostalAddress', addressLocality: 'Springfield', postalCode: '62701' },
    })
    const crumbs = breadcrumbListLd(site, [
      { name: 'Home', path: '/' },
      { name: 'Page', path: '/x' },
    ])
    expect(crumbs.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com/' },
      { '@type': 'ListItem', position: 2, name: 'Page', item: 'https://example.com/x' },
    ])
  })

  it('escapes < so content cannot close the script tag', () => {
    expect(serializeJsonLd({ a: '</script>' })).not.toContain('</script>')
  })
})

describe('llms.txt', () => {
  it('lists indexable pages only', () => {
    const txt = llmsTxt(site, 'Summary.', [page, { path: '/pricing', title: 'P', description: 'x' }])
    expect(txt).toContain('- [T](https://example.com/): D')
    expect(txt).not.toContain('/pricing')
  })
})
