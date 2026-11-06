import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentProps, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { TranslatedPathsProvider } from '../i18n/ui'
import { FlowNav } from './flow-nav'
import { TabRootHeader } from './tab-root-header'
import { BrandProvider, Wordmark } from './wordmark'

vi.mock('next/navigation', () => ({ usePathname: () => '/generate', useRouter: () => ({}), useParams: () => ({}), redirect: vi.fn(), permanentRedirect: vi.fn(), notFound: vi.fn() }))

const messages = { app: { tabs: { home: '{brand} home page' } } }

// As in app/[locale]/layout.tsx: the root layout says which paths have a /zh version.
const render = (locale: 'en' | 'zh', brand: string | null, page: ReactElement = createElement(Wordmark)) => {
  const branded: ComponentProps<typeof BrandProvider> = { name: brand ?? '', children: page }
  const mark = brand ? createElement(BrandProvider, branded) : page
  const zhPaths: ComponentProps<typeof TranslatedPathsProvider> = { paths: ['/'], children: mark }
  const paths = createElement(TranslatedPathsProvider, zhPaths)
  const provider: ComponentProps<typeof NextIntlClientProvider> = { locale, messages, timeZone: 'UTC', children: paths }
  return renderToStaticMarkup(createElement(NextIntlClientProvider, provider))
}

// Spec #199: the signed-in pages show "Shotviva." linking to the landing page in their language.
describe('Wordmark', () => {
  it('links to the landing page of the page language, with the safelight period', () => {
    const en = render('en', 'Shotviva')
    expect(en).toMatch(/href="\/"/)
    expect(en).toContain('aria-label="Shotviva home page"')
    expect(en).toMatch(/Shotviva<span aria-hidden="true" class="text-primary">\.<\/span>/)
    expect(render('zh', 'Shotviva')).toMatch(/href="\/zh"/)
  })

  it('renders nothing outside the app shell (no brand given)', () => {
    expect(render('en', null)).toBe('')
  })

  // Tab roots carry it (phones; the top bar from md); flow pages keep Back and no wordmark.
  it('is in the tab-root header and not on flow pages', () => {
    expect(render('en', 'Shotviva', createElement(TabRootHeader, { title: 'Create' }))).toContain('data-wordmark')
    const flow = render('en', 'Shotviva', createElement(FlowNav, { back: { href: '/generate', label: 'Create' }, title: 'Pure White' }))
    expect(flow).toContain('Create')
    expect(flow).not.toContain('data-wordmark')
  })
})
