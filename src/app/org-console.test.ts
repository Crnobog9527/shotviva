import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'

import { CONSOLE_ERRORS, type OwnerConsole, type StaffCard } from '@/core/org/console/types'

vi.mock('@/core/i18n/ui', () => ({ Link: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement('a', { href, ...rest }, children as never) }))
vi.mock('@/core/analytics/replay', () => ({ REPLAY_BLOCK_CLASS: 'sv-replay-block' }))

const { OwnerConsoleView, OwnerEntryRow } = await import('@/core/org/ui/owner-console')
const { StaffCardView } = await import('@/core/org/ui/staff-card')
const { JoinForm } = await import('@/core/org/ui/join-form')

// Fake data only: no real company, account or price.
const ORG = '11111111-1111-4111-8111-111111111111'
const MEMBER = '00000000-0000-4000-8000-0000000000b2'
const owner = (over: Partial<OwnerConsole['org']> = {}, extra: Partial<OwnerConsole> = {}): OwnerConsole => ({
  kind: 'owner',
  org: { id: ORG, name: 'Acme Studio', status: 'active', poolCredits: 120000, affiliateEnabled: true, affiliateLevels: 1, ...over },
  inviteToken: 'a'.repeat(32),
  members: [
    { userId: '00000000-0000-4000-8000-0000000000a1', account: 'owner@acme.test', role: 'owner', monthlyAllowance: 0, heldCredits: 0, customers: 0, joinedAt: '2026-11-01T00:00:00Z' },
    { userId: MEMBER, account: 'ann@acme.test', role: 'member', monthlyAllowance: 500, heldCredits: 320, customers: 3, joinedAt: '2026-11-02T00:00:00Z' },
  ],
  memberTotal: 2,
  packages: [{ id: ORG, name: 'Starter', priceUsdCents: 500000, credits: 833333 }],
  depositable: 700,
  paymentAccounts: null,
  ...extra,
})
const staff: StaffCard = { kind: 'member', orgName: 'Acme Studio', status: 'active', monthlyAllowance: 500, allocatedThisMonth: 600, heldCredits: 80, customers: 3 }

const ownerActions = {
  deposit: async () => ({ ok: true as const, pool: 1 }), allocate: async () => ({ ok: true as const, pool: 1 }),
  setAllowance: async () => ({ ok: true as const, allowance: 1 }), removeMember: async () => ({ ok: true as const, reclaimed: 1 }),
  resetInvite: async () => ({ ok: true as const, token: 'b'.repeat(32) }),
}

type Messages = typeof en
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: Messages; timeZone: string; onError: (error: Error) => void }>
function render(locale: 'en' | 'zh', element: ReactElement) {
  const errors: string[] = []
  const html = renderToStaticMarkup(createElement(Intl, { locale, messages: locale === 'en' ? en : (zh as unknown as Messages), timeZone: 'UTC', onError: (e) => errors.push(e.message) }, element))
  return { html, errors, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }
}

describe.each(['en', 'zh'] as const)('enterprise block (%s)', (locale) => {
  it("shows the owner's pool, USD packages with the transfer note, the invite link and the members", () => {
    const { text, html, errors } = render(locale, createElement(OwnerConsoleView, { data: owner(), actions: ownerActions }))
    expect(errors).toEqual([])
    expect(text).toContain('120,000')
    expect(text).toContain('$5,000')
    expect(text).toContain('833,333')
    expect(text).toContain('/join/org/' + 'a'.repeat(32))
    expect(text).toContain('ann@acme.test')
    expect(html).toContain('/account?help=new')
    // Packages are USD only: no yuan sign anywhere.
    expect(text).not.toMatch(/[¥￥]|CNY|RMB/)
    // The monthly report waits on E5: a marked slot, not a table.
    expect(html).toContain('data-slot="org-performance-pending"')
  })

  it('shows the collecting accounts by group with the org name in the note, or a marked placeholder', () => {
    const groups = [{ title: 'Group A', fields: [{ label: 'Bank', value: 'Example Bank' }, { label: 'Account', value: '0000 0000' }] }, { title: 'Group B', fields: [{ label: 'Payee', value: 'Example Agent' }] }]
    const shown = render(locale, createElement(OwnerConsoleView, { data: owner({}, { paymentAccounts: groups }), actions: ownerActions }))
    expect(shown.errors).toEqual([])
    expect(shown.text).toContain('Group A')
    expect(shown.text).toContain('Example Agent')
    expect(shown.text).toContain('Acme Studio')
    expect(shown.html).not.toContain('org-payment-accounts-pending')
    const pending = render(locale, createElement(OwnerConsoleView, { data: owner(), actions: ownerActions }))
    expect(pending.html).toContain('data-slot="org-payment-accounts-pending"')
  })

  it('offers no remove button for the owner row and one for each member', () => {
    const { html } = render(locale, createElement(OwnerConsoleView, { data: owner(), actions: ownerActions }))
    const removes = html.match(/<button[^>]*>(Remove|移除)<\/button>/g) ?? []
    expect(removes).toHaveLength(1)
  })

  it('says the account is paused and disables pool actions for a suspended org', () => {
    const { html, errors } = render(locale, createElement(OwnerConsoleView, { data: owner({ status: 'suspended' }), actions: ownerActions }))
    expect(errors).toEqual([])
    expect(html).toMatch(/paused|暂停/)
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(5)
  })

  it("shows a member's card with this month's numbers, a leave button and the marked spend slot", () => {
    const { text, errors } = render(locale, createElement(StaffCardView, { data: staff, actions: { leave: async () => ({ ok: true as const, reclaimed: 0 }) }, loadInvite: (async () => ({})) as never }))
    expect(errors).toEqual([])
    expect(text).toContain('Acme Studio')
    expect(text).toMatch(/600/)
    expect(text).toMatch(/80/)
    expect(text).toMatch(/Leave company|退出企业/)
    expect(text).toMatch(/Coming soon|即将上线/)
  })

  it('renders the account row and the join confirmation', () => {
    const row = render(locale, createElement(OwnerEntryRow, { name: 'Acme Studio', pool: '120,000', suspended: false }))
    expect(row.errors).toEqual([])
    expect(row.html).toContain('href="/account/enterprise"')
    const join = render(locale, createElement(JoinForm, { join: async () => ({ ok: true as const }), orgName: 'Acme Studio' }))
    expect(join.errors).toEqual([])
    expect(join.text).toContain('Acme Studio')
  })
})

describe('messages', () => {
  const keys = (value: unknown, prefix = ''): string[] =>
    value && typeof value === 'object' ? Object.entries(value).flatMap(([k, v]) => keys(v, `${prefix}${k}.`)) : [prefix.slice(0, -1)]

  it('has the same keys in English and Chinese', () => {
    expect(keys(zh.app.org).sort()).toEqual(keys(en.app.org).sort())
  })

  it('words every console error in both languages', () => {
    for (const code of CONSOLE_ERRORS) {
      expect(en.app.org.errors[code], code).toBeTruthy()
      expect(zh.app.org.errors[code], code).toBeTruthy()
    }
  })
})
