import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'

import { CONSOLE_ERRORS, type OwnerConsole, type OwnerReport, type PaymentAccountGroup, type StaffCard } from '@/core/org/console/types'

vi.mock('@/core/i18n/ui', () => ({ Link: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement('a', { href, ...rest }, children as never) }))
vi.mock('@/core/analytics/replay', () => ({ REPLAY_BLOCK_CLASS: 'sv-replay-block' }))

const { OwnerConsoleView, OwnerEntryRow, PurchasingView } = await import('@/core/org/ui/owner-console')
const { StaffCardView } = await import('@/core/org/ui/staff-card')
const { JoinForm } = await import('@/core/org/ui/join-form')

// Fake data only: no real company, account or price.
const ORG = '11111111-1111-4111-8111-111111111111'
const MEMBER = '00000000-0000-4000-8000-0000000000b2'
const owner = (over: Partial<OwnerConsole['org']> = {}, extra: Partial<OwnerConsole> = {}): OwnerConsole => ({
  kind: 'owner',
  org: { id: ORG, name: 'Acme Studio', refCode: 'SV-K7M2PX', status: 'active', poolCredits: 120000, affiliateEnabled: true, affiliateLevels: 1, ...over },
  inviteToken: 'a'.repeat(32),
  members: [
    { userId: '00000000-0000-4000-8000-0000000000a1', account: 'owner@acme.test', role: 'owner', monthlyAllowance: 0, heldCredits: 0, customers: 0, joinedAt: '2026-11-01T00:00:00Z' },
    { userId: MEMBER, account: 'ann@acme.test', role: 'member', monthlyAllowance: 500, heldCredits: 320, customers: 3, joinedAt: '2026-11-02T00:00:00Z' },
  ],
  memberTotal: 2,
  packages: [{ id: ORG, name: 'Starter', priceUsdCents: 123400, credits: 98765 }],
  depositable: 700,
  paymentAccounts: null,
  ...extra,
})
const staff: StaffCard = { kind: 'member', orgName: 'Acme Studio', status: 'active', monthlyAllowance: 500, allocatedThisMonth: 600, heldCredits: 80, customers: 3,
  withLevel2: false, period: '2026-11', performance: { l1: { customers: 3, signups: 1, paying: 2, paidCents: 12345 }, l2: { customers: 0, signups: 0, paying: 0, paidCents: 0 } },
}

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

const report = (over: Partial<OwnerReport> = {}): OwnerReport => ({
  period: '2026-11', previous: '2026-10', next: null, withAffiliate: true, withLevel2: true,
  rows: [
    { userId: '00000000-0000-4000-8000-0000000000a1', account: 'owner@acme.test', role: 'owner', status: 'active', allocated: 0, used: 0, l1: { signups: 0, paying: 0, paidCents: 0 }, l2: { signups: 0, paying: 0, paidCents: 0 } },
    { userId: MEMBER, account: 'ann@acme.test', role: 'member', status: 'active', allocated: 500, used: 120, l1: { signups: 3, paying: 2, paidCents: 12345 }, l2: { signups: 1, paying: 1, paidCents: 999 } },
    { userId: '00000000-0000-4000-8000-0000000000d4', account: 'gone@acme.test', role: 'member', status: 'removed', allocated: 0, used: 0, l1: { signups: 1, paying: 0, paidCents: 0 }, l2: { signups: 0, paying: 0, paidCents: 0 } },
  ],
  totals: { allocated: 500, used: 120, l1: { signups: 4, paying: 2, paidCents: 12345 }, l2: { signups: 1, paying: 1, paidCents: 999 } },
  ...over,
})

describe.each(['en', 'zh'] as const)('monthly table (%s)', (locale) => {
  it('shows the monthly table with totals, a month picker and the CSV downloads, and no commission', () => {
    const { html, text, errors } = render(locale, createElement(OwnerConsoleView, { data: owner(), actions: ownerActions, affiliate: true, report: report() }))
    expect(errors).toEqual([])
    expect(text).toContain('$123.45')
    expect(text).toContain('$9.99')
    expect(text).toContain('2026-11')
    expect(html).toContain('/account/enterprise?month=2026-10')
    // It is the current month: nothing later to go to.
    expect(html).not.toContain('month=2026-12')
    expect(html).toContain('/api/account/enterprise/report?month=2026-11&amp;kind=members')
    expect(html).toContain('kind=customers')
    expect(text).toMatch(/Left|已离开/)
    expect(text).not.toMatch(/commission|佣金/i)
    // Level 2 columns only for an org that has level 2.
    const one = render(locale, createElement(OwnerConsoleView, { data: owner(), actions: ownerActions, affiliate: true, report: report({ withLevel2: false }) }))
    expect(one.html.match(/<th /g)?.length).toBeLessThan(html.match(/<th /g)?.length ?? 0)
    // No affiliate: no customer columns and no customer download.
    const none = render(locale, createElement(OwnerConsoleView, { data: owner(), actions: ownerActions, affiliate: true, report: report({ withAffiliate: false, withLevel2: false }) }))
    expect(none.html).not.toContain('kind=customers')
  })
})

describe.each(['en', 'zh'] as const)('enterprise block (%s)', (locale) => {

  it("shows the workspace: the staff-only link first, then the pool and the members, without packages", () => {
    const { text, html, errors } = render(locale, createElement(OwnerConsoleView, { data: owner(), actions: ownerActions, report: null, affiliate: true }))
    expect(errors).toEqual([])
    expect(text).toContain('120,000')
    // Built in Chinese whatever the console's language (ENTERPRISE_LINK_LOCALE).
    expect(text).toContain('/zh/join/org/' + 'a'.repeat(32))
    expect(text).toContain('ann@acme.test')
    // Owner 2026-11-22: the staff link comes before the pool, and warns that customers must not get it.
    expect(text.indexOf(locale === 'en' ? 'Staff-only link' : '员工专用链接')).toBeLessThan(text.indexOf(locale === 'en' ? 'Credit pool' : '积分池'))
    expect(text).toMatch(locale === 'en' ? /send it to customers/ : /不要发给客户/)
    expect(html).toContain('href="/partners/enterprise"')
    expect(html).toContain('var(--caution-edge)')
    // Packages and bank transfer moved to the purchasing page.
    expect(text).not.toContain('$1,234')
    // No report read: the table says so instead of a made-up number.
    expect(text).toMatch(/be loaded|加载失败/)
  })

  it('shows the collecting accounts by group with the enterprise number to quote, or a marked placeholder', () => {
    const groups: PaymentAccountGroup[] = [
      { kind: 'overseas_us', details: { account_name: 'Sample Holdings', bank_name: 'Example Bank', account_number: '0000 0000', empty: '' } },
      { kind: 'mainland_agent', details: { account_name: 'Example Agent', currency: 'CNY' } },
    ]
    const shown = render(locale, createElement(PurchasingView, { data: owner({}, { paymentAccounts: groups }) }))
    expect(shown.errors).toEqual([])
    expect(shown.text).toContain(locale === 'en' ? 'US company business account' : '海外美国公司对公账户')
    expect(shown.text).toContain(locale === 'en' ? 'Account number / IBAN' : '账号 / IBAN')
    expect(shown.text).toContain('Example Agent')
    expect(shown.text).toContain('SV-K7M2PX')
    expect(shown.text).toContain(locale === 'en' ? 'Put this number in your payment reference' : '汇款时请在附言中填写企业编号')
    expect(shown.html).toContain('data-slot="org-ref-code"')
    expect(shown.html).not.toContain('org-payment-accounts-pending')
    const pending = render(locale, createElement(PurchasingView, { data: owner() }))
    expect(pending.html).toContain('data-slot="org-payment-accounts-pending"')
  })

  it('offers no remove button for the owner row and one for each member', () => {
    const { html } = render(locale, createElement(OwnerConsoleView, { data: owner(), actions: ownerActions, report: null, affiliate: true }))
    const removes = html.match(/<button[^>]*>(Remove|移除)<\/button>/g) ?? []
    expect(removes).toHaveLength(1)
  })

  it("shows a member's card with this month's numbers, a leave button and the customers' spend", () => {
    const { text, errors } = render(locale, createElement(StaffCardView, { data: staff, actions: { leave: async () => ({ ok: true as const, reclaimed: 0 }) }, loadInvite: (async () => ({})) as never }))
    expect(errors).toEqual([])
    expect(text).toContain('Acme Studio')
    expect(text).toMatch(/600/)
    expect(text).toMatch(/80/)
    expect(text).toMatch(/Leave company|退出企业/)
    // Level-1 customers, how many pay and what they spent this month (fake data: $123.45).
    expect(text).toContain('$123.45')
    expect(text).not.toMatch(/Coming soon|即将上线|commission|佣金/i)
  })

  it('renders the account row', () => {
    const row = render(locale, createElement(OwnerEntryRow, { name: 'Acme Studio', pool: '120,000', suspended: false, affiliate: false }))
    expect(row.errors).toEqual([])
    expect(row.html).toContain('href="/account/enterprise"')
    // With the affiliate on, the area opens on 企业联盟 (Owner 2026-11-22).
    const affiliateRow = render(locale, createElement(OwnerEntryRow, { name: 'Acme Studio', pool: '120,000', suspended: false, affiliate: true }))
    expect(affiliateRow.html).toContain('href="/partners/enterprise"')
  })
})

describe.each(['en', 'zh'] as const)('join confirmation (%s)', (locale) => {
  it('asks for the click and never joins on its own', () => {
    // Joining always takes the click (review of #829): rendering the form never joins.
    const joinSpy = vi.fn(async () => ({ ok: true as const }))
    const join = render(locale, createElement(JoinForm, { join: joinSpy, orgName: 'Acme Studio' }))
    expect(join.errors).toEqual([])
    expect(join.text).toContain('Acme Studio')
    expect(join.html).toMatch(/<button[^>]*>[^<]*Acme Studio/)
    expect(joinSpy).not.toHaveBeenCalled()
  })
})

describe.each(['en', 'zh'] as const)('purchasing and the staff link (%s)', (locale) => {
  it('leaves out the affiliate pointer when the org has no affiliate section', () => {
    const { html } = render(locale, createElement(OwnerConsoleView, { data: owner(), actions: ownerActions, report: null, affiliate: false }))
    expect(html).not.toContain('href="/partners/enterprise"')
  })

  it('opens the China region contact instead of a ticket when the site names one (Owner 2026-11-22)', () => {
    const contact = { name: 'Sample Manager', email: 'sales@example.test', wechat: 'sample-wechat' }
    const { html, text, errors } = render(locale, createElement(PurchasingView, { data: owner(), contact }))
    expect(errors).toEqual([])
    expect(text).toMatch(locale === 'en' ? /Contact us to arrange a transfer/ : /联系我们转账/)
    expect(html).not.toContain('/account?help=new')
    // The email is plain text with a copy button, never a mailto link.
    expect(html).not.toContain('mailto:')
  })

  it('shows USD packages with the transfer note on the purchasing page', () => {
    const { text, html, errors } = render(locale, createElement(PurchasingView, { data: owner() }))
    expect(errors).toEqual([])
    expect(text).toContain('$1,234')
    expect(text).toContain('98,765')
    expect(html).toContain('/account?help=new')
    // Packages are USD only: no yuan sign anywhere.
    expect(text).not.toMatch(/[¥￥]|CNY|RMB/)
    expect(text).not.toContain('/join/org/')
  })
  it('says the account is paused and disables pool actions for a suspended org', () => {
    const { html, errors } = render(locale, createElement(OwnerConsoleView, { data: owner({ status: 'suspended' }), actions: ownerActions, report: null, affiliate: true }))
    expect(errors).toEqual([])
    expect(html).toMatch(/paused|暂停/)
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(5)
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
