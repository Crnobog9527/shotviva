import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentProps, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { LocaleMenu, NavLink, TranslatedPathsProvider } from '@/core/i18n/ui'
import { menuTarget } from '@/core/i18n/ui/locale-menu'
import { loadMessages } from '@/site/i18n/messages'

// Gap audit B1 / B2: the current top-nav item and the globe menu's semantics.
const path = vi.hoisted(() => ({ current: '/pricing' }))
vi.mock('@/core/i18n/navigation', async (original) => ({ ...(await original()), usePathname: () => path.current }))

const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: unknown; timeZone: string }>

async function render(element: ReactElement, locale: 'en' | 'zh' = 'en') {
  // Typed props object (as home-faq.test.ts): the provider requires children.
  const paths: ComponentProps<typeof TranslatedPathsProvider> = { paths: ['/', '/pricing'], children: element }
  const inner = createElement(TranslatedPathsProvider, paths)
  return renderToStaticMarkup(createElement(Intl, { locale, messages: await loadMessages(locale), timeZone: 'UTC' }, inner))
}

describe('top nav current item (B1)', () => {
  it('marks Pricing aria-current="page" on /pricing and /zh/pricing', async () => {
    path.current = '/pricing'
    expect(await render(createElement(NavLink, { href: '/pricing', className: 'mk-nl' }, 'Pricing'))).toContain('aria-current="page"')
    expect(await render(createElement(NavLink, { href: '/pricing' }, '价格'), 'zh')).toMatch(/href="\/zh\/pricing"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/zh\/pricing"/)
  })

  it('leaves it off everywhere else', async () => {
    path.current = '/'
    expect(await render(createElement(NavLink, { href: '/pricing' }, 'Pricing'))).not.toContain('aria-current')
  })
})

describe('globe menu (B2)', () => {
  it('is a menu button with radio items, the current language checked, closed at first', async () => {
    path.current = '/'
    const html = await render(createElement(LocaleMenu, { translatedPaths: ['/'] }))
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toMatch(/<ul[^>]*role="menu"[^>]*hidden/)
    expect(html.match(/role="menuitemradio"/g)).toHaveLength(2)
    expect(html).toMatch(/aria-checked="true"[^>]*href="\/"|href="\/"[^>]*aria-checked="true"/)
  })

  it('moves focus with the arrow keys, wrapping, and jumps with Home / End', () => {
    expect(menuTarget('ArrowDown', 0, 2)).toBe(1)
    expect(menuTarget('ArrowDown', 1, 2)).toBe(0)
    expect(menuTarget('ArrowUp', 0, 2)).toBe(1)
    expect(menuTarget('ArrowDown', -1, 2)).toBe(0)
    expect(menuTarget('Home', 1, 2)).toBe(0)
    expect(menuTarget('End', 0, 2)).toBe(1)
    expect(menuTarget('Tab', 0, 2)).toBeNull()
    expect(menuTarget('ArrowDown', -1, 0)).toBeNull()
  })
})

// Owner 2026-11-08 (DESIGN): the home grid, the landing grids and the 404 cards show a template's
// name and use, never a "from N credits" / 「N 积分起」 chip; prices stay on /pricing, the paywall
// and the generate button.
describe('no price on marketing template cards', () => {
  const card = (id: string) => ({ id, name: `Name ${id}`, use: `Use of ${id}` })
  const media = { cheap: { before: '/b.webp', after: '/a.webp', live: true }, dear: { before: null, after: null, live: false }, art: { before: '/b.webp', after: '/a.webp', live: true } }
  const sections = {
    categories: [
      { name: 'Art Styles', intro: '', drag: true, templates: [card('art')] as [ReturnType<typeof card>] },
      { name: 'Pets', intro: '', templates: [card('cheap'), card('dear')] as [ReturnType<typeof card>, ReturnType<typeof card>] },
    ],
    media,
  }
  const noPrice = (html: string) => {
    expect(html).not.toMatch(/credit|积分|mk-cost/)
  }

  it('the template grid (grid and single-template rows) shows name and use only, en and zh', async () => {
    const { TemplateGrid } = await import('@/core/content/blocks/template-grid')
    const grid = createElement(TemplateGrid, { grid: { heading: 'h', intro: 'i' }, sections, isLinkEnabled: () => true })
    for (const locale of ['en', 'zh'] as const) {
      const html = await render(grid, locale)
      for (const id of ['art', 'cheap', 'dear']) expect(html).toContain(`Use of ${id}`)
      noPrice(html)
    }
  })

  it('the 404 cards show name and use only', async () => {
    const { TryTemplates } = await import('@/core/content')
    const tries = await render(createElement(TryTemplates, { templates: [{ ...card('cheap'), before: '/b.webp', after: '/a.webp' }] }))
    expect(tries).toContain('Use of cheap')
    noPrice(tries)
  })
})
