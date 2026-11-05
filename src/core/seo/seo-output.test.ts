import { describe, expect, it } from 'vitest'

import { breadcrumbListLd, organizationLd, serializeJsonLd, softwareApplicationLd } from './json-ld'
import { llmsTxt } from './llms-txt'
import { appShellMetadata, pageMetadata } from './metadata'
import { AI_CRAWLERS, robotsRules } from './robots'
import { testSite } from './test-site'

const site = testSite()
const page = { path: '/', title: 'T', description: 'D' }

describe('robots', () => {
  it('allows every named AI crawler and never disallows /', () => {
    const rules = [robotsRules(site).rules].flat()
    for (const bot of AI_CRAWLERS) {
      expect(rules).toContainEqual({ userAgent: bot, allow: '/' })
    }
    expect(JSON.stringify(rules)).not.toContain('disallow')
    expect(robotsRules(site).sitemap).toBe('https://example.com/sitemap.xml')
  })
})

describe('metadata', () => {
  it('indexes listed pages with a self canonical and noindexes the rest', () => {
    expect(pageMetadata(site, page).robots).toEqual({ index: true, follow: true })
    expect(pageMetadata(site, page).alternates?.canonical).toBe('https://example.com/')
    expect(pageMetadata(site, { ...page, path: '/pricing' }).robots).toEqual({
      index: false,
      follow: false,
    })
    expect(appShellMetadata().robots).toEqual({ index: false, follow: false })
  })
})

describe('json-ld', () => {
  it('publishes the free offer and only decided prices', () => {
    const offers = softwareApplicationLd(site, page).offers as { name: string; price: string }[]
    expect(offers.map((o) => [o.name, o.price])).toEqual([
      ['Free', '0'],
      ['pack', '49.00'],
    ])
  })

  it('uses the site wording for the free offer and counts paid offers in credits', () => {
    const offers = softwareApplicationLd(site, page, '3 free Standard images').offers as { description: string }[]
    expect(offers.map((o) => o.description)).toEqual(['3 free Standard images', '120 credits'])
    const fallback = softwareApplicationLd(site, page).offers as { description: string }[]
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
