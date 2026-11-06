import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { testSite } from '../../seo/test-site'
import { SiteFooter } from '../blocks/site-footer'
import { defineLegalPage, formatLegalDate } from './legal-page'
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

describe('LegalPageView', () => {
  it('renders headings, a table of contents, links, lists and the address as HTML', () => {
    const html = renderToStaticMarkup(createElement(LegalPageView, { page }))
    expect(html).toContain('<h1')
    expect(html).toContain('<time dateTime="2026-11-05">November 5, 2026</time>')
    expect(html).toContain('href="#credits"')
    expect(html).toContain('id="credits"')
    expect(html).toContain('>1. Credits</h2>')
    expect(html).toContain('href="/refund-policy"')
    expect(html).toContain('href="mailto:hi@example.com"')
    expect(html).toContain('<li>One</li>')
    expect(html).toMatch(/<address[^>]*>.*Example LLC.*1 Main St.*<\/address>/)
  })

  it('formats the date in UTC regardless of the machine time zone', () => {
    expect(formatLegalDate('2026-01-01')).toBe('January 1, 2026')
  })
})

describe('SiteFooter', () => {
  it('shows the official-site statement, contact, copyright and the legal links, not the operating entity', () => {
    const { brand } = testSite()
    const links = [{ href: '/terms', label: 'Terms' }] as const
    const messages = {
      footer: {
        legalNav: 'Legal',
        official: '{name} — {tagline}. {domain} is the only official {name} site.',
        launched: 'Launched {year}. Serving {countries}. Contact: <mail>{email}</mail>',
        copyright: '© {year} {name}',
        language: 'Language',
      },
    }
    const provider: ComponentProps<typeof NextIntlClientProvider> = {
      locale: 'en',
      messages,
      children: createElement(SiteFooter, { brand, links, countries: 'United States' }),
    }
    const html = renderToStaticMarkup(createElement(NextIntlClientProvider, provider))
    expect(html).toContain('example.com is the only official Example site.')
    expect(html).toContain('© 2026 Example</p>')
    expect(html).not.toContain('operated by')
    expect(html).not.toContain('Example LLC')
    expect(html).not.toContain('1 Main St')
    expect(html).toContain('Launched 2026. Serving United States. Contact: <a href="mailto:hi@example.com"')
    expect(html).toContain('href="/terms"')
    // The MiSans attribution moved to the Terms page (ARCHITECTURE §17).
    expect(html).not.toContain('MiSans')
  })
})
