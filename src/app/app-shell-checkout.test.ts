import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TabBar } from '@/core/app-shell'
import { loadMessages } from '@/site/i18n/messages'

// Gap audit C1 (comps-v3-b checkout.html, `body.app` + the tab bar): the checkout return page
// sits in the app shell like a tab root, so the buyer can leave it without the page's own links.
const path = vi.hoisted(() => ({ current: '/checkout' }))
vi.mock('@/core/i18n/navigation', async (original) => ({ ...(await original()), usePathname: () => path.current }))

const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: unknown; timeZone: string }>
const tabs = [
  { href: '/generate', label: 'Create', icon: 'create' },
  { href: '/photos', label: 'Photos', icon: 'photos' },
  { href: '/account', label: 'Account', icon: 'account' },
] as const

async function render(pathname: string, locale: 'en' | 'zh' = 'en') {
  path.current = pathname
  const bar = createElement(TabBar, { items: tabs, desktopUnder: ['/photos/'], shellPages: ['/checkout'] })
  return renderToStaticMarkup(createElement(Intl, { locale, messages: await loadMessages(locale), timeZone: 'UTC' }, bar))
}

describe('app shell on /checkout', () => {
  beforeEach(() => {
    path.current = '/checkout'
  })

  it('shows the full bar (phone tab bar and desktop top bar), with no tab marked current', async () => {
    const html = await render('/checkout')
    expect(html).toContain('<nav')
    expect(html).toContain('data-tabbar=""')
    expect(html).not.toContain('max-md:hidden')
    expect(html).not.toContain('aria-current="page"')
    for (const href of ['/generate', '/photos', '/account']) expect(html).toContain(`href="${href}"`)
  })

  it('in Chinese too', async () => {
    expect(await render('/checkout', 'zh')).toContain('data-tabbar=""')
  })

  it('leaves the other rules alone: a flow page has no bar, a tab root marks itself', async () => {
    expect(await render('/generate/pure-white')).toBe('')
    expect(await render('/photos')).toContain('aria-current="page"')
    expect(await render('/checkout-something')).toBe('')
  })
})
