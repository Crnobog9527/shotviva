import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ComponentType, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', async (original) => ({ ...(await original<object>()), usePathname: () => '/zh', useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }))

import { GuestBar } from './guest-bar'

const messages = { home: { generator: { panelSignUp: '免费注册，生成这张图' } } }
const Provider = NextIntlClientProvider as ComponentType<{ locale: string; messages: typeof messages; children?: ReactNode }>

// Signed out, the panel's footer is the page's own new-user gift line (the same one the
// first-screen card shows, from site.config freeCredits through the page) over the sign-up link.
describe('the template panel signed out', () => {
  const html = renderToStaticMarkup(createElement(Provider, { locale: 'zh', messages },
    createElement(GuestBar, { next: '/zh?panel=cake&set=bundle%3Abundle-b1', gift: '100 个免费积分，新用户专享' })))

  it('says the gift it is given, not a number of its own', () => {
    expect(html).toContain('100 个免费积分，新用户专享')
  })

  it('goes to sign-up with the way back to this panel', () => {
    expect(html).toContain('免费注册，生成这张图')
    expect(html).toMatch(/href="[^"]*\/signup\?next=%2Fzh%3Fpanel%3Dcake%26set%3Dbundle%253Abundle-b1"/)
  })
})
