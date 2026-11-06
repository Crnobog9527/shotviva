import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
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
  const inner = createElement(TranslatedPathsProvider, { paths: ['/', '/pricing'], children: element })
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

describe('card prices (A1)', () => {
  it('each template card and 404 card shows its own Standard price', async () => {
    const { TemplateGrid } = await import('@/core/content/blocks/template-grid')
    const { TryTemplates } = await import('@/core/content')
    const card = (id: string, credits: number) => ({ id, name: id, use: 'use', credits })
    const media = { cheap: { before: '/b.webp', after: '/a.webp', live: true }, dear: { before: null, after: null, live: false } }
    const grid = createElement(TemplateGrid, {
      grid: { heading: 'h', intro: 'i' },
      sections: { categories: [{ name: 'Pets', intro: '', templates: [card('cheap', 1), card('dear', 3)] }], media },
      isLinkEnabled: () => true,
    })
    const html = await render(grid)
    expect(html).toContain('from 1 credit<')
    expect(html).toContain('from 3 credits<')
    const zh = await render(grid, 'zh')
    expect(zh).toContain('1 积分起')
    const tries = await render(createElement(TryTemplates, { templates: [{ ...card('cheap', 1), before: '/b.webp', after: '/a.webp' }] }))
    expect(tries).toContain('from 1 credit<')
  })
})
