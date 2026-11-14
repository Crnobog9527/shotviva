import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { testSite } from '../../seo/test-site'
import { SiteFooter } from '../blocks/site-footer'
import { defineLegalPage, formatLegalDate, type LegalPage } from './legal-page'
import { LegalPageView } from './legal-page-view'

const page = defineLegalPage({
  path: '/terms',
  title: 'Terms',
  description: 'Terms',
  h1: 'Terms of Service',
  label: 'Terms',
  lastUpdated: '2026-11-05',
  intro: ['Intro text.'],
  sections: [
    {
      id: 'credits',
      heading: 'Credits',
      blocks: [
        ['See the ', { href: '/refund-policy', label: 'Refund Policy' }, '.'],
        { list: ['One', ['Two ', { href: 'mailto:hi@example.com', label: 'hi@example.com' }]] },
      ],
    },
    { id: 'contact', heading: 'Contact us', blocks: [{ lines: ['Example LLC', '1 Main St'] }] },
  ],
})

const legal = {
  pagesLabel: 'Legal pages',
  lastUpdated: 'Last updated <date></date>',
  contents: 'Contents',
  questions: 'Questions about this page: <mail></mail>',
}
const nav = [
  { href: '/terms', label: 'Terms', current: true },
  { href: '/privacy', label: 'Privacy', current: false },
]

function render(input: LegalPage = page) {
  const provider: ComponentProps<typeof NextIntlClientProvider> = {
    locale: 'en',
    messages: { legal },
    children: createElement(LegalPageView, { page: input, nav, email: 'hi@example.com' }),
  }
  return renderToStaticMarkup(createElement(NextIntlClientProvider, provider))
}

describe('LegalPageView (legal.html, T45)', () => {
  it('renders the title, the date, the four-page pills, the contents and the numbered text as HTML', () => {
    const html = render()
    expect(html).toContain('<h1>Terms of Service</h1>')
    expect(html).toContain('Last updated <time dateTime="2026-11-05">5 November 2026</time>')
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/terms"|<a[^>]*href="\/terms"[^>]*aria-current="page"/)
    expect(html).toContain('href="#credits"')
    expect(html).toContain('<section id="credits" aria-labelledby="credits-heading" class="n">')
    expect(html).toContain('<h2 id="credits-heading">Credits</h2>')
    expect(html).toContain('href="/refund-policy"')
    expect(html).toContain('href="mailto:hi@example.com"')
    expect(html).toContain('<li>One</li>')
    expect(html).toMatch(/<address>.*Example LLC.*1 Main St.*<\/address>/)
    expect(html).toContain('Questions about this page: <a href="mailto:hi@example.com">hi@example.com</a>')
  })

  it('leaves a plain section out of the numbering', () => {
    const html = render({ ...page, sections: [...page.sections, { id: 'third-party-notices', heading: 'Third-party notices', plain: true, blocks: ['MiSans'] }] })
    expect(html).toContain('<section id="third-party-notices" aria-labelledby="third-party-notices-heading">')
    expect(html).toContain('<li class="plain"><a href="#third-party-notices">')
  })

  it('formats the date in UTC regardless of the machine time zone', () => {
    expect(formatLegalDate('2026-01-01')).toBe('1 January 2026')
  })
})

describe('SiteFooter', () => {
  it('carries only the contact email, the copyright and the legal links (建站规格 G8)', () => {
    const { brand } = testSite()
    const links = [{ href: '/terms', label: 'Terms' }] as const
    const messages = { footer: { legalNav: 'Legal', copyright: '© {year} {name}', language: 'Language' } }
    const provider: ComponentProps<typeof NextIntlClientProvider> = {
      locale: 'en',
      messages,
      children: createElement(SiteFooter, { brand, links }),
    }
    const html = renderToStaticMarkup(createElement(NextIntlClientProvider, provider))
    expect(html).toContain('href="mailto:hi@example.com"')
    expect(html).toContain('© 2026 Example</span>')
    expect(html).toContain('href="/terms"')
    expect(html).not.toContain('official')
    expect(html).not.toContain('Launched')
    expect(html).not.toContain('operated by')
    expect(html).not.toContain('Example LLC')
    expect(html).not.toContain('1 Main St')
    // The MiSans attribution moved to the Terms page (ARCHITECTURE §17).
    expect(html).not.toContain('MiSans')
  })
})
