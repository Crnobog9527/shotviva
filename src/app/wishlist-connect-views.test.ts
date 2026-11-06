import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ConnectAllow, ConnectAlready, ConnectError } from '@/core/partner/ui'
import type { MyRequest, WallCard } from '@/core/wishlist'
import { MyRequestsView, WallView } from '@/core/wishlist/ui'
import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'

// T46: the wishlist and the Graylum connect page to the signed-off v3-b comps
// (design/comps-v3-b/wishlist.html, connect.html), in English and Chinese, rendered to HTML.

// The locale-aware Link needs the app router; a plain anchor keeps the href under test.
vi.mock('@/core/i18n/ui', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement('a', { href, ...rest }, children as never),
}))
vi.mock('@/core/i18n/navigation', () => ({ useRouter: () => ({ push: () => {} }) }))

type Messages = typeof en
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: Messages; timeZone: string }>
const render = (element: ReactElement, locale: 'en' | 'zh' = 'en') =>
  renderToStaticMarkup(createElement(Intl, { locale, messages: (locale === 'en' ? en : zh) as Messages, timeZone: 'UTC' }, element))
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"')

const NOW = '2026-11-06T12:00:00Z'
const live: WallCard = {
  id: 'r-live',
  description: 'A flat-lay for brunch menus.',
  authorLabel: 'M***',
  status: 'live',
  votesCount: 27,
  voted: true,
  template: null,
  imageUrls: ['https://r2.test/a.jpg', 'https://r2.test/b.jpg'],
  createdAt: '2026-11-01T12:00:00Z',
}
const shipped: WallCard = { ...live, id: 'r-shipped', status: 'shipped', voted: false, votesCount: 41, template: { id: 'dark-dining', name: 'Dark Dining' }, imageUrls: ['https://r2.test/c.jpg'] }
const page = <T,>(items: T[]) => ({ items, nextCursor: null })
const load = async () => page<never>([])
const wall = (cards: WallCard[], eligible = true) => createElement(WallView, { first: page(cards), eligible, now: NOW, loadMore: load })

describe('wishlist wall', () => {
  it('pins each request as a print with its photos, the masked author and when, and the vote pill', () => {
    const html = render(wall([live]))
    expect(html).toContain('class="wl-wall"')
    expect(html).toContain('class="wl-req"')
    expect(text(html)).toContain('M*** · 5 days ago')
    expect(html).toMatch(/class="wl-vote"[^>]*aria-pressed="true"/)
    expect(html).toContain('aria-label="I want this too, 27 votes"')
    // two photos: a count badge in the corner
    expect(html).toMatch(/class="wl-count"[^>]*>.*2<\/span>/)
    expect(html).toContain('href="/wishlist/new"')
  })

  it('stamps a shipped request, links it into its template and only shows its count', () => {
    const html = render(wall([shipped]))
    expect(html).toContain('class="wl-stamp"')
    expect(html).toContain('href="/generate/dark-dining"')
    expect(text(html)).toContain('Now the Dark Dining template')
    expect(html).toContain('data-static=""')
    expect(html).not.toMatch(/<button[^>]*class="wl-vote"/)
  })

  it('greys voting and the request button below the threshold', () => {
    const html = render(wall([live], false))
    expect(html).toMatch(/class="wl-vote"[^>]*disabled=""/)
    expect(text(html)).toContain('Create one photo first to join')
    expect(html).not.toContain('href="/wishlist/new"')
  })

  it('shows the empty plate with the one primary, or the gate line', () => {
    expect(text(render(wall([])))).toContain('Tell us what template you need')
    expect(render(wall([]))).toContain('href="/wishlist/new"')
    const gated = render(wall([], false))
    expect(text(gated)).toContain('Create one photo first to join')
    expect(gated).not.toContain('href="/wishlist/new"')
  })

  it('reads in Chinese without the italic hand', () => {
    const html = render(wall([shipped]), 'zh')
    expect(text(html)).toContain('已做成 Dark Dining 模板')
    expect(text(html)).toContain('M*** · 5天前')
  })
})

const mine = (status: MyRequest['status'], extra: Partial<MyRequest> = {}): MyRequest => ({
  id: `m-${status}`,
  description: `A ${status} request`,
  status,
  votesCount: 12,
  templateId: null,
  imageUrls: status === 'rejected' ? [] : ['https://r2.test/m.jpg'],
  createdAt: '2026-11-05T12:00:00Z',
  ...extra,
})

describe('my requests', () => {
  it('lists each request with its state, when, and votes once on the wall', () => {
    const items = [mine('live'), mine('pending'), mine('shipped', { templateId: 'dark-dining' }), mine('rejected')]
    const html = render(createElement(MyRequestsView, { first: page(items), now: NOW, loadMore: load }))
    for (const [status, label] of [['live', 'Live'], ['pending', 'Pending'], ['shipped', 'Shipped'], ['rejected', 'Rejected']]) {
      expect(html).toContain(`data-status="${status}">${label}<`)
    }
    expect(text(html).match(/12 votes/g)).toHaveLength(2)
    expect(html).toContain('href="/generate/dark-dining"')
    // a rejected request has no photo left
    expect(html.match(/<img /g)).toHaveLength(3)
  })

  it('has an empty state back to the wall', () => {
    const html = render(createElement(MyRequestsView, { first: page([]), now: NOW, loadMore: load }))
    expect(text(html)).toContain("You haven't requested anything yet")
    expect(html).toContain('href="/wishlist"')
  })
})

const target = { action: '/zh/connect/graylum/authorize', state: 'graylum-state-1', returnTo: null, graylumHome: 'https://graylum.com' }
const switchAccount = async () => {}

describe('connect page', () => {
  it('asks to allow, posting state to the localized authorize route', () => {
    const html = render(createElement(ConnectAllow, { target, email: 'mei@example.com', balance: null, switchAccount }))
    expect(text(html)).toContain('Let Graylum make photos with your Shotviva credits?')
    expect(text(html)).toContain("You're logged in as mei@example.com")
    expect(html).toMatch(/<form action="\/zh\/connect\/graylum\/authorize" method="post">/)
    expect(html).toContain('name="state" value="graylum-state-1"')
    expect(html).not.toContain('name="return_to"')
    expect(html).toContain('href="https://graylum.com"')
    expect(text(html)).toContain('Log in with a different account')
  })

  it('says when an already connected account was linked', () => {
    const html = render(createElement(ConnectAlready, { target, linkedAt: new Date('2026-11-02T10:00:00Z') }))
    expect(text(html)).toContain('Graylum is already connected')
    expect(text(html)).toContain('connected since Nov 2, 2026')
    expect(html).toContain('href="/account"')
  })

  it('explains an invalid link or a failure, and that nothing was connected or charged', () => {
    const invalid = text(render(createElement(ConnectError, { failure: 'invalid', graylumHome: 'https://graylum.com' })))
    expect(invalid).toContain("This connection link isn't valid")
    expect(invalid).toContain('expired, been used already, or come from somewhere other than Graylum')
    expect(invalid).toContain('Nothing was connected and nothing was charged.')
    expect(text(render(createElement(ConnectError, { failure: 'failed', graylumHome: 'https://graylum.com' })))).toContain('Something went wrong')
  })

  it('is in Chinese on /zh', () => {
    const html = text(render(createElement(ConnectAllow, { target, email: 'mei@example.com', balance: null, switchAccount }), 'zh'))
    expect(html).toContain('要让 Graylum 用你的 Shotviva 积分出图吗？')
    expect(html).toContain('允许 Graylum')
    expect(text(render(createElement(ConnectError, { failure: 'invalid', graylumHome: 'https://graylum.com' }), 'zh'))).toContain('这个连接链接无效')
  })
})
