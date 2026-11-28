import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'

import { CONSOLE_ERRORS, type OwnerConsole, type OwnerReport, type PaymentAccountGroup } from '@/core/org/console/types'

vi.mock('@/core/i18n/ui', () => ({ Link: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement('a', { href, ...rest }, children as never) }))
vi.mock('next/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ refresh: () => undefined }) }))
vi.mock('@/core/analytics/replay', () => ({ REPLAY_BLOCK_CLASS: 'sv-replay-block' }))

const { OwnerConsoleView, OwnerEntryRow, PurchasingView } = await import('@/core/org/ui/owner-console')
const { MembersPanel } = await import('@/core/org/ui/members-panel')
const { PoolPanel } = await import('@/core/org/ui/owner-panels')
const { PerformancePanel } = await import('@/core/org/ui/performance-panel')
const { JoinForm } = await import('@/core/org/ui/join-form')

// Fake data only: no real company, account or price.
const ORG = '11111111-1111-4111-8111-111111111111'
const MEMBER = '00000000-0000-4000-8000-0000000000b2'
const owner = (over: Partial<OwnerConsole['org']> = {}, extra: Partial<OwnerConsole> = {}): OwnerConsole => ({
  kind: 'owner',
  org: { id: ORG, name: 'Acme Studio', refCode: 'SV-K7M2PX', status: 'active', poolCredits: 120000, affiliateEnabled: true, affiliateLevels: 1,
    promoPoolCredits: 4321, promoExpiresAt: '2026-12-01T00:00:00Z', defaultPaidAllowance: 200, defaultPromoAllowance: 500, ...over },
  inviteToken: 'a'.repeat(32),
  members: [
    { userId: '00000000-0000-4000-8000-0000000000a1', account: 'owner@acme.test', role: 'owner', monthlyAllowance: 0, heldCredits: 0, promoAllowance: 500, heldPromoCredits: 0, paidFollowsDefault: true, promoFollowsDefault: true, paidUnset: true, promoUnset: true, customers: 0, joinedAt: '2026-11-01T00:00:00Z' },
    { userId: MEMBER, account: 'ann@acme.test', role: 'member', monthlyAllowance: 500, heldCredits: 320, promoAllowance: 2000, heldPromoCredits: 1750, paidFollowsDefault: false, promoFollowsDefault: false, paidUnset: false, promoUnset: false, customers: 3, joinedAt: '2026-11-02T00:00:00Z' },
  ],
  memberTotal: 2,
  packages: [{ id: ORG, name: 'Starter', priceUsdCents: 123400, credits: 98765 }],
  depositable: 700,
  paymentAccounts: null,
  poolMonth: { period: '2026-11', paid: { in: 5000, allocated: 600, reclaimed: 0, clawedBack: 0, restored: 0 }, promo: { granted: 10000, allocated: 2000, reclaimed: 0, expired: 0, held: 1750 } },
  ...extra,
})

const ownerActions = {
  deposit: async () => ({ ok: true as const, pool: 1 }), allocate: async () => ({ ok: true as const, pool: 1 }),
  setAllowance: async () => ({ ok: true as const, allowance: 1 }), removeMember: async () => ({ ok: true as const, reclaimed: 1 }),
  resetInvite: async () => ({ ok: true as const, token: 'b'.repeat(32) }),
  allocatePromo: async () => ({ ok: true as const, pool: 1 }), setPromoAllowance: async () => ({ ok: true as const, allowance: 1 }),
  setDefaults: async () => ({ ok: true as const, paid: 1, promo: 1 }), bulkSetAllowance: async () => ({ ok: true as const, members: 1 }),
  bulkGrant: async () => ({ ok: true as const, members: 1, total: 1, pool: 1 }),
  pools: async () => ({ ok: true as const, pool: 0, promoPool: 0 }),
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

describe.each(['en', 'zh'] as const)('pool panel without the affiliate program (%s)', (locale) => {
  it('shows no promotion pool and no move-in form when there is nothing to move in', () => {
    const { text, html, errors } = render(locale, createElement(PoolPanel, { data: owner({ affiliateEnabled: false, promoPoolCredits: 0, promoExpiresAt: null }, { depositable: 0 }), actions: ownerActions }))
    expect(errors).toEqual([])
    expect(text).toContain('120,000')
    expect(text).not.toMatch(/Promotion|推广/)
    expect(html).not.toMatch(/<form|<input/)
    // Purchases going straight into the pool is still said.
    expect(text).toMatch(locale === 'en' ? /goes straight into the pool/ : /直接存入积分池/)
  })

  it('keeps the move-in form while the owner holds paid credits, and promotion credits left this month', () => {
    const { text, html } = render(locale, createElement(PoolPanel, { data: owner({ affiliateEnabled: false, promoPoolCredits: 300 }, { depositable: 700 }), actions: ownerActions }))
    expect(html).toContain('<form')
    expect(text).toContain('700')
    expect(text).toContain(locale === 'en' ? 'Promotion pool' : '推广积分池')
  })
})

describe.each(['en', 'zh'] as const)('monthly table without the affiliate program (%s)', (locale) => {
  it('does not promise customers it does not show', () => {
    const { text } = render(locale, createElement(PerformancePanel, { report: report({ withAffiliate: false, withLevel2: false }) }))
    expect(text).not.toMatch(/customer|客户|Sign-ups|注册/i)
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
      { kind: 'mainland_agent', details: { account_name: 'Example Agent', currency: 'CNY' } },
      { kind: 'overseas_us', details: { account_name: 'Sample Holdings', bank_name: 'Example Bank', account_number: '0000 0000', empty: '' } },
    ]
    const shown = render(locale, createElement(PurchasingView, { data: owner({}, { paymentAccounts: groups }) }))
    expect(shown.errors).toEqual([])
    expect(shown.text).toContain(locale === 'en' ? 'US company business account' : '美国公司对公账户')
    expect(shown.text).toContain(locale === 'en' ? 'Account number / IBAN' : '账号 / IBAN')
    expect(shown.text).toContain('Example Agent')
    // Each group is its own panel, the US company first whatever order the read returns (Owner 2026-11-23).
    expect(shown.html.match(/data-slot="org-payment-account"/g)).toHaveLength(2)
    expect(shown.text.indexOf('Sample Holdings')).toBeLessThan(shown.text.indexOf('Example Agent'))
    expect(shown.text).toContain('SV-K7M2PX')
    expect(shown.text).toContain(locale === 'en' ? 'Put this number in your payment reference' : '汇款时请在附言中填写企业编号')
    expect(shown.html).toContain('data-slot="org-ref-code"')
    expect(shown.html).not.toContain('org-payment-accounts-pending')
    const pending = render(locale, createElement(PurchasingView, { data: owner() }))
    expect(pending.html).toContain('data-slot="org-payment-accounts-pending"')
  })

  it('offers no remove button on the owner row and one on a member row, once its editor is open', () => {
    const panel = (initialOpen: string) => render(locale, createElement(MembersPanel, { data: owner(), actions: ownerActions, initialOpen })).html
    expect(panel('00000000-0000-4000-8000-0000000000a1').match(/<button[^>]*>(Remove|移除)<\/button>/g) ?? []).toHaveLength(0)
    expect(panel(MEMBER).match(/<button[^>]*>(Remove|移除)<\/button>/g) ?? []).toHaveLength(1)
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

describe.each(['en', 'zh'] as const)('promotion pool (%s)', (locale) => {
  it('shows both pools, the month of each, and separate paid and promotion allowances per member (企业推广积分池)', () => {
    const { text, errors } = render(locale, createElement(OwnerConsoleView, { data: owner(), actions: ownerActions, report: null, affiliate: true }))
    expect(errors).toEqual([])
    expect(text).toContain(locale === 'en' ? 'Promotion pool' : '推广积分池')
    expect(text).toContain('4,321')
    // Valid through the last day of November (the pool expires at 1 December 00:00 UTC).
    expect(text).toMatch(locale === 'en' ? /Valid through Nov 30, 2026/ : /有效期至 2026年11月30日/)
    // Each row is compact: what is left of each kind, and the customers.
    expect(text).toContain(locale === 'en' ? '1,750 promotion credits left' : '推广积分剩 1,750')
    expect(text).toContain('1,750')
    expect(text).toContain('10,000') // granted into the promotion pool this month
    // Purchase clawbacks and won-dispute returns (2033): two separate non-negative rows.
    const month = render(locale, createElement(OwnerConsoleView, {
      data: owner({}, { poolMonth: { period: '2026-11', paid: { in: 5000, allocated: 600, reclaimed: 0, clawedBack: 1234, restored: 567 },
        promo: { granted: 10000, allocated: 2000, reclaimed: 0, expired: 0, held: 1750 } } }),
      actions: ownerActions, report: null, affiliate: true,
    }))
    expect(month.errors).toEqual([])
    expect(month.text).toMatch(locale === 'en' ? /Taken back for refunds\s*1,234/ : /退款扣回\s*1,234/)
    expect(month.text).toMatch(locale === 'en' ? /Returned after a won dispute\s*567/ : /拒付胜诉还回\s*567/)
    // Deposit stays paid-only.
    expect(text).toContain(locale === 'en' ? 'Move in paid credits already on your account' : '转入你账号里已有的付费积分')
    // Two forms per kind for the member whose editor is open: allowance and top-up.
    const open = render(locale, createElement(MembersPanel, { data: owner(), actions: ownerActions, initialOpen: MEMBER }))
    expect(open.text).toContain(locale === 'en' ? 'Monthly promotion allowance' : '推广月额度')
    expect(open.html.match(/<fieldset/g)).toHaveLength(2)
    expect(open.text).toContain(locale === 'en' ? 'Top up paid credits manually' : '手动补充付费积分')
    expect(open.text).toContain(locale === 'en' ? 'Top up promotion credits manually' : '手动补充推广积分')
    expect(open.text).not.toMatch(/立即划拨|Give now/)
  })
})

describe.each(['en', 'zh'] as const)('org member action bar (%s)', (locale) => {
  it('asks an org member to go to the admin instead of opening the paywall when the org credits are short', async () => {
    const { FormAction } = await import('@/modules/image/workspace/form-action')
    const state = { kind: 'get-credits' as const, cost: 20, needed: 10, count: 1 }
    const member = render(locale, createElement(FormAction, { state, resolution: '2k', batch: false, onGenerate: () => {}, orgOnly: true }))
    expect(member.errors).toEqual([])
    expect(member.text).toContain(locale === 'en' ? 'Ask your admin to allocate more' : '请联系管理员分配额度')
    expect(member.html).toContain('disabled')
  })

  // 1996: 1K is free (for a member, promotion) credits only; the bar says so instead of a paywall.
  it('says 1K uses free credits only when they are short, for members and everyone else', async () => {
    const { FormAction } = await import('@/modules/image/workspace/form-action')
    const state = { kind: 'tier-pool' as const, reason: 'free-only' as const, cost: 20, count: 1 }
    for (const orgOnly of [true, false]) {
      const bar = render(locale, createElement(FormAction, { state, resolution: '1k', batch: false, onGenerate: () => {}, orgOnly }))
      expect(bar.errors).toEqual([])
      expect(bar.text).toContain(locale === 'en' ? '1K uses free credits only' : '1K 只用免费积分')
      expect(bar.html).toContain('disabled')
    }
  })
})

describe.each(['en', 'zh'] as const)('defaults and bulk (%s)', (locale) => {
  it('shows the default allowances, marks who follows them, offers use-default to personal ones and the selection entry', () => {
    const { text, html, errors } = render(locale, createElement(OwnerConsoleView, { data: owner(), actions: ownerActions, report: null, affiliate: true }))
    expect(errors).toEqual([])
    expect(text).toContain(locale === 'en' ? 'Default monthly allowances' : '默认月额度')
    expect(html).toContain('value="200"')
    expect(html).toContain('value="500"')
    // The owner follows both defaults (marked when open); ann has personal values (two use-default buttons when open).
    const mark = locale === 'en' ? '(default)' : '（默认）'
    const useDefault = locale === 'en' ? /<button[^>]*>Use default<\/button>/g : /<button[^>]*>恢复默认<\/button>/g
    expect(text.split(mark).length - 1).toBe(0)
    const ownerOpen = render(locale, createElement(MembersPanel, { data: owner(), actions: ownerActions, initialOpen: '00000000-0000-4000-8000-0000000000a1' }))
    expect(ownerOpen.text.split(mark).length - 1).toBe(2)
    expect(ownerOpen.html.match(useDefault)).toBeNull()
    const annOpen = render(locale, createElement(MembersPanel, { data: owner(), actions: ownerActions, initialOpen: MEMBER }))
    expect(annOpen.html.match(useDefault)).toHaveLength(2)
    expect(text).toContain(locale === 'en' ? 'Select members' : '批量选择')
    expect(html).not.toContain('data-slot="org-bulk-bar"') // only in selection mode
  })

  it('shows the search and joined-from filter outside selection mode, rows collapsed, and 30 rows with a show-more button', () => {
    const many = Array.from({ length: 35 }, (_, i) => ({ ...owner().members[1], userId: `00000000-0000-4000-8000-${String(i + 100).padStart(12, '0')}`, account: `user${String(i).padStart(2, '0')}@acme.test` }))
    const { html, text, errors } = render(locale, createElement(MembersPanel, { data: owner({}, { members: many, memberTotal: 35 }), actions: ownerActions }))
    expect(errors).toEqual([])
    expect(html).toContain('type="search"')
    expect(html).toContain('type="date"')
    expect(html).not.toContain('<fieldset') // every editor closed
    // The list is its own surface: titled, bordered, and scrolling on its own.
    expect(text).toContain(locale === 'en' ? 'Staff (35)' : '员工（35）')
    expect(html).toMatch(/<section[^>]*border-hairline bg-wash[^>]*>.*<ul[^>]*overflow-y-auto/)
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(30)
    expect(text).toContain('user29@acme.test')
    expect(text).not.toContain('user30@acme.test')
    expect(text).toContain(locale === 'en' ? 'Show 5 more (30 of 35 shown)' : '再显示 5 位（已显示 30 / 35）')
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
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(3)
    // An open editor disables its own save / top-up / use-default buttons too.
    const open = render(locale, createElement(MembersPanel, { data: owner({ status: 'suspended' }), actions: ownerActions, initialOpen: MEMBER }))
    expect((open.html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(6)
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
