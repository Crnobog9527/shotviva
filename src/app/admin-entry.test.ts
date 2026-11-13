import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { SettingsRows } from '@/core/account/ui/settings-rows'
import { AdminLink, adminEntryFor, TabBar } from '@/core/app-shell'
import { clientMessages } from '@/core/i18n'
import { loadMessages } from '@/site/i18n/messages'

// The front-end way into /admin (ARCHITECTURE §10, spec #186): rendered on the server only for
// profiles.role = 'admin'. A normal user's HTML carries no link, no label, no hidden element.

vi.mock('@/core/i18n/navigation', async (original) => ({ ...(await original()), usePathname: () => '/account' }))
// Purchases reads ?purchases= (T80); outside the App Router there is no search params context.
vi.mock('next/navigation', async (original) => ({ ...(await original()), useSearchParams: () => new URLSearchParams() }))

const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: unknown; timeZone: string }>

async function render(element: ReactElement, locale: 'en' | 'zh' = 'en') {
  return renderToStaticMarkup(createElement(Intl, { locale, messages: await loadMessages(locale), timeZone: 'UTC' }, element))
}

const rows = (admin: boolean) => createElement(SettingsRows, { email: 'a@example.test', phone: null, purchases: [], morePurchases: false, helpUnread: false, admin })

describe('account page Admin row', () => {
  it('an admin gets "Admin" as the first Settings row, linking to /admin', async () => {
    const html = await render(rows(true))
    // The panel's first child is the Admin link.
    const first = html.match(/^<div[^>]*>(<a [^>]*>)Admin</)?.[1] ?? ''
    expect(first).toContain('href="/admin"')
    expect(first).toContain('data-admin-entry=""')
  })

  it('in Chinese it reads 管理后台', async () => {
    expect(await render(rows(true), 'zh')).toContain('>管理后台<')
  })

  it('a normal user gets no link, no label and no hidden element', async () => {
    for (const locale of ['en', 'zh'] as const) {
      const html = await render(rows(false), locale)
      expect(html).not.toContain('/admin')
      expect(html).not.toContain('data-admin-entry')
      expect(html).not.toMatch(/>Admin<|管理后台/)
    }
  })
})

describe('messages handed to the client', () => {
  it('leave out the admin entry and the server-rendered affiliate and gallery messages in both languages', async () => {
    for (const locale of ['en', 'zh'] as const) {
      const all = await loadMessages(locale)
      const client = clientMessages(all)
      expect(all).toHaveProperty('adminEntry')
      expect(client).not.toHaveProperty('adminEntry')
      expect(client).not.toHaveProperty('affiliate')
      // T108: the public gallery translates on the server, so no other page carries its text.
      expect(all).toHaveProperty('gallery')
      expect(client).not.toHaveProperty('gallery')
      // The template share page (Owner 2026-11-13) translates on the server too.
      expect(Object.keys(client)).toEqual(Object.keys(all).filter((key) => !['adminEntry', 'affiliate', 'gallery', 'share'].includes(key)))
      expect(JSON.stringify(client)).not.toContain('管理后台')
    }
  })
})

describe('app shell Admin item', () => {
  const tabs = [{ href: '/account', label: 'Account', icon: 'account' }] as const
  // The layout streams the item into the bar's `admin` slot, built the same way.
  const bar = (role: string) => {
    const entry = adminEntryFor(role, () => (role === 'admin' ? '管理后台' : 'Admin'))
    return createElement(TabBar, { items: tabs, admin: entry ? createElement(AdminLink, { entry }) : null })
  }

  it('is built only for profiles.role = admin', () => {
    expect(adminEntryFor('admin', () => 'Admin')).toEqual({ href: '/admin', label: 'Admin' })
    for (const role of ['user', null, undefined]) expect(adminEntryFor(role, () => 'Admin')).toBeUndefined()
    const label = vi.fn(() => 'Admin')
    adminEntryFor('user', label)
    expect(label).not.toHaveBeenCalled()
  })

  it('an admin gets it at the right end of the desktop top bar, hidden on phones', async () => {
    const html = await render(bar('admin'), 'zh')
    const link = html.match(/<a [^>]*data-admin-entry=""[^>]*>/)?.[0] ?? ''
    expect(link).toContain('href="/admin"')
    expect(link).toMatch(/\bhidden\b.*\bmd:flex\b/)
    expect(html).toContain('管理后台</a>')
  })

  it('a normal user gets no link, no label and no hidden element', async () => {
    const html = await render(bar('user'))
    expect(html).not.toContain('/admin')
    expect(html).not.toContain('data-admin-entry')
  })
})

describe('account Settings for a phone sign-up (T63)', () => {
  const phoneRows = (email: string | null) =>
    createElement(SettingsRows, { email, phone: '140****5678', purchases: [], morePurchases: false, helpUnread: false, admin: false })

  it('shows the masked number, and no empty email row when there is no email', async () => {
    const html = await render(phoneRows(null), 'zh')
    expect(html).toContain('手机号')
    expect(html).toContain('140****5678')
    expect(html).not.toContain('邮箱')
  })

  it('keeps the email row when the account has both', async () => {
    const html = await render(phoneRows('a@example.test'))
    expect(html).toContain('Phone')
    expect(html).toContain('a@example.test')
  })
})

it.each(['en', 'zh'] as const)('only shows the affiliate dashboard to active members in %s', async (locale) => {
  const props = { email: null, phone: null, purchases: [], morePurchases: false, helpUnread: false, admin: false }
  const label = locale === 'en' ? 'My affiliate dashboard' : '我的联盟营销后台'
  expect(await render(createElement(SettingsRows, { ...props, affiliate: true }), locale)).toContain(label)
  expect(await render(createElement(SettingsRows, { ...props, affiliate: false }), locale)).not.toContain('/partners')
})
