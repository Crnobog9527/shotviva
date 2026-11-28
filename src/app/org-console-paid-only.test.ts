import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'

import type { OwnerActions } from '@/core/org/ui/actions'
import type { OwnerConsole } from '@/core/org/console/types'

// The owner's workspace in an org without the enterprise affiliate program (a production tool,
// Owner 2026-11-28): no promotion-credit control anywhere, except what is still left after
// leaving the program. The affiliate org's promotion controls are covered in org-console.test.ts.

vi.mock('@/core/i18n/ui', () => ({ Link: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement('a', { href, ...rest }, children as never) }))
vi.mock('next/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ refresh: () => undefined }) }))
vi.mock('@/core/analytics/replay', () => ({ REPLAY_BLOCK_CLASS: 'sv-replay-block' }))
// The bulk sheet is a portal (nothing on the server); render its body in place.
vi.mock('@/core/ui/responsive-sheet', () => ({ ResponsiveSheet: ({ children }: { children: ReactNode }) => createElement('div', null, children) }))

const { OwnerConsoleView } = await import('@/core/org/ui/owner-console')
const { MembersPanel } = await import('@/core/org/ui/members-panel')
const { BulkSheet, GrantForm } = await import('@/core/org/ui/bulk-sheet')
const { StaffLinkPanel } = await import('@/core/org/ui/staff-link-panel')

// Fake data only: no real company, account or price.
const MEMBER = '00000000-0000-4000-8000-0000000000b2'
const owner = (over: Partial<OwnerConsole['org']> = {}, extra: Partial<OwnerConsole> = {}): OwnerConsole => ({
  kind: 'owner',
  org: { id: '11111111-1111-4111-8111-111111111111', name: 'Acme Studio', refCode: 'SV-K7M2PX', status: 'active', poolCredits: 120000, affiliateEnabled: true, affiliateLevels: 1,
    promoPoolCredits: 4321, promoExpiresAt: '2026-12-01T00:00:00Z', defaultPaidAllowance: 200, defaultPromoAllowance: 500, ...over },
  inviteToken: 'a'.repeat(32),
  members: [
    { userId: '00000000-0000-4000-8000-0000000000a1', account: 'owner@acme.test', role: 'owner', monthlyAllowance: 0, heldCredits: 0, promoAllowance: 500, heldPromoCredits: 0, paidFollowsDefault: true, promoFollowsDefault: true, paidUnset: true, promoUnset: true, customers: 0, joinedAt: '2026-11-01T00:00:00Z' },
    { userId: MEMBER, account: 'ann@acme.test', role: 'member', monthlyAllowance: 500, heldCredits: 320, promoAllowance: 2000, heldPromoCredits: 1750, paidFollowsDefault: false, promoFollowsDefault: false, paidUnset: false, promoUnset: false, customers: 3, joinedAt: '2026-11-02T00:00:00Z' },
  ],
  memberTotal: 2,
  packages: [],
  depositable: 700,
  paymentAccounts: null,
  poolMonth: null,
  ...extra,
})
// The views only call actions on a click; none runs while rendering.
const ownerActions = {} as OwnerActions

type Messages = typeof en
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: Messages; timeZone: string; onError: (error: Error) => void }>
function render(locale: 'en' | 'zh', element: ReactElement) {
  const errors: string[] = []
  const html = renderToStaticMarkup(createElement(Intl, { locale, messages: locale === 'en' ? en : (zh as unknown as Messages), timeZone: 'UTC', onError: (e) => errors.push(e.message) }, element))
  return { html, errors, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }
}

// A workspace bought only as a production tool (no affiliate program, Owner 2026-11-28): paid credits only.
const noAffiliate = (memberPromo = 0) => {
  const data = owner({ affiliateEnabled: false, promoPoolCredits: 0, promoExpiresAt: null }, {
    poolMonth: { period: '2026-11', paid: { in: 5000, allocated: 600, reclaimed: 0, clawedBack: 0, restored: 0 }, promo: { granted: 10000, allocated: 2000, reclaimed: 0, expired: 0, held: memberPromo } },
  })
  return { ...data, members: data.members.map((m) => ({ ...m, heldPromoCredits: m.role === 'member' ? memberPromo : 0, customers: 0 })) }
}

describe.each(['en', 'zh'] as const)('owner console without the affiliate program (%s)', (locale) => {
  it('shows no promotion control anywhere: pool, defaults, member rows, member editor or month table', () => {
    const data = noAffiliate()
    const page = render(locale, createElement(OwnerConsoleView, { data, actions: ownerActions, report: null, affiliate: false }))
    expect(page.errors).toEqual([])
    expect(page.text).not.toMatch(/Promotion|promotion|推广/)
    // The month table keeps the paid column only.
    expect(page.text).toContain('5,000')
    expect(page.text).not.toContain('10,000')
    const open = render(locale, createElement(MembersPanel, { data, actions: ownerActions, initialOpen: MEMBER }))
    expect(open.errors).toEqual([])
    expect(open.text).not.toMatch(/Promotion|promotion|推广/)
    expect(open.text).not.toMatch(/customers|客户/i)
    expect(open.html.match(/<fieldset/g)).toHaveLength(1)
    expect(open.text).toContain(locale === 'en' ? 'Top up paid credits manually' : '手动补充付费积分')
    // The defaults form has the paid field only.
    expect(open.html.match(/<input/g)?.length).toBe(1 + 2 + 2) // search + joined-from, then the paid default; the editor's paid allowance and top-up
  })

  it('keeps the promotion line and forms of a member who still holds some after the org left the program', () => {
    const data = noAffiliate(1750)
    const open = render(locale, createElement(MembersPanel, { data, actions: ownerActions, initialOpen: MEMBER }))
    expect(open.errors).toEqual([])
    expect(open.text).toContain(locale === 'en' ? '1,750 promotion credits left' : '推广积分剩 1,750')
    expect(open.html.match(/<fieldset/g)).toHaveLength(2)
    expect(open.text).toContain(locale === 'en' ? 'Top up promotion credits manually' : '手动补充推广积分')
    // The month table keeps its promotion column while members hold some.
    const page = render(locale, createElement(OwnerConsoleView, { data, actions: ownerActions, report: null, affiliate: false }))
    expect(page.text).toContain('10,000')
  })

  it('keeps every promotion control while the org pool still has promotion credits after leaving', () => {
    const data = owner({ affiliateEnabled: false, promoPoolCredits: 300 })
    const open = render(locale, createElement(MembersPanel, { data, actions: ownerActions, initialOpen: MEMBER }))
    expect(open.text).toContain(locale === 'en' ? 'Monthly promotion allowance' : '推广月额度')
    expect(open.html.match(/<fieldset/g)).toHaveLength(2)
  })
})

describe.each(['en', 'zh'] as const)('bulk sheet without the affiliate program (%s)', (locale) => {
  const sheet = (data: OwnerConsole) => createElement(BulkSheet, { open: true, onOpenChange: () => {}, members: [MEMBER], data, actions: ownerActions, onDone: () => {} })
  const grant = (data: OwnerConsole) => createElement(GrantForm, { members: [MEMBER], data, actions: ownerActions, onDone: () => {} })
  const promo = /Promotion|promotion|推广/

  it('offers the paid allowance only and grants paid credits only', () => {
    const data = owner({ affiliateEnabled: false, promoPoolCredits: 0, promoExpiresAt: null })
    const allowance = render(locale, sheet(data))
    expect(allowance.errors).toEqual([])
    expect(allowance.text).not.toMatch(promo)
    const given = render(locale, grant(data))
    expect(given.errors).toEqual([])
    expect(given.text).not.toMatch(promo)
    expect(given.text).toContain('120,000') // from the paid pool
  })

  it('offers both kinds in an affiliate org, and while promotion credits are left after leaving', () => {
    for (const data of [owner(), owner({ affiliateEnabled: false, promoPoolCredits: 300 })]) {
      expect(render(locale, sheet(data)).text).toMatch(promo)
      expect(render(locale, grant(data)).text).toMatch(promo)
    }
  })
})

describe.each(['en', 'zh'] as const)('staff-only link without the affiliate program (%s)', (locale) => {
  it('warns against passing it on without mentioning customers, and keeps the customer warning in an affiliate org', () => {
    const none = render(locale, createElement(StaffLinkPanel, { data: owner({ affiliateEnabled: false }), actions: ownerActions, affiliate: false }))
    expect(none.errors).toEqual([])
    expect(none.text).not.toMatch(/customer|客户|referr|推荐/i)
    expect(none.text).toContain(locale === 'en' ? 'Anyone who opens it joins your company as staff' : '不要外传')
    const withProgram = render(locale, createElement(StaffLinkPanel, { data: owner(), actions: ownerActions, affiliate: true }))
    expect(withProgram.text).toMatch(locale === 'en' ? /send it to customers/ : /不要发给客户/)
  })
})
