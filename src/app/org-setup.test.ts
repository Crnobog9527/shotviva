import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'

import type { OwnerConsole, OwnerReport } from '@/core/org/console/types'

vi.mock('@/core/i18n/ui', () => ({ Link: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement('a', { href, ...rest }, children as never) }))
vi.mock('next/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ refresh: () => undefined }) }))
vi.mock('@/core/analytics/replay', () => ({ REPLAY_BLOCK_CLASS: 'sv-replay-block' }))

const { OwnerConsoleView, OwnerEntryRow } = await import('@/core/org/ui/owner-console')
const { PoolPanel } = await import('@/core/org/ui/owner-panels')
const { PerformancePanel } = await import('@/core/org/ui/performance-panel')
const { orgSetup } = await import('@/core/org/ui/org-setup')

// The ways an org can be set up (Owner 2026-11-28): affiliate only, workspace only, both, neither.
// Fake data only: no real company, account or price.
const owner = (over: Partial<OwnerConsole['org']> = {}): OwnerConsole => ({
  kind: 'owner',
  org: { id: '11111111-1111-4111-8111-111111111111', name: 'Acme Studio', refCode: 'SV-K7M2PX', status: 'active', poolCredits: 120000, affiliateEnabled: true, affiliateLevels: 1,
    promoPoolCredits: 0, promoExpiresAt: null, defaultPaidAllowance: 200, defaultPromoAllowance: 0, ...over },
  inviteToken: 'a'.repeat(32), members: [], memberTotal: 1, packages: [], depositable: 0, paymentAccounts: null, poolMonth: null,
})
const report = (withAffiliate: boolean): OwnerReport => ({
  period: '2026-11', previous: null, next: null, withAffiliate, withLevel2: false, rows: [],
  totals: { allocated: 0, used: 0, l1: { signups: 0, paying: 0, paidCents: 0 }, l2: { signups: 0, paying: 0, paidCents: 0 } },
})
const actions = new Proxy({}, { get: () => async () => ({ ok: true }) }) as never

type Messages = typeof en
const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: Messages; timeZone: string; onError: (error: Error) => void }>
function render(locale: 'en' | 'zh', element: ReactElement) {
  const errors: string[] = []
  const html = renderToStaticMarkup(createElement(Intl, { locale, messages: locale === 'en' ? en : (zh as unknown as Messages), timeZone: 'UTC', onError: (e) => errors.push(e.message) }, element))
  return { html, errors, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }
}
const say = (locale: 'en' | 'zh', english: string, chinese: string) => (locale === 'en' ? english : chinese)

describe('orgSetup', () => {
  it('reads the workspace from the status and the affiliate from its switch', () => {
    expect(orgSetup('active', true)).toBe('both')
    expect(orgSetup('active', false)).toBe('workspace')
    expect(orgSetup('suspended', true)).toBe('affiliate')
    expect(orgSetup('suspended', false)).toBe('off')
  })
})

describe.each(['en', 'zh'] as const)('owner, by setup (%s)', (locale) => {
  const row = (setup: 'both' | 'workspace' | 'affiliate' | 'off') =>
    render(locale, createElement(OwnerEntryRow, { name: 'Acme Studio', pool: '120,000', setup, affiliate: setup === 'affiliate' || setup === 'both' }))

  it('says on the account row what is off, never that the account is paused', () => {
    for (const setup of ['both', 'workspace'] as const) expect(row(setup).text).toContain('120,000')
    const affiliateOnly = row('affiliate')
    expect(affiliateOnly.errors).toEqual([])
    expect(affiliateOnly.text).toContain(say(locale, 'Company workspace not active', '企业工作台未开启'))
    expect(affiliateOnly.text).not.toContain('120,000')
    expect(row('off').text).toContain(say(locale, 'Company account inactive', '企业已停用'))
    for (const setup of ['both', 'workspace', 'affiliate', 'off'] as const) expect(row(setup).text).not.toMatch(/paused|暂停/i)
  })

  it('shows no banner while the workspace runs', () => {
    for (const org of [owner(), owner({ affiliateEnabled: false })]) {
      expect(render(locale, createElement(OwnerConsoleView, { data: org, actions, report: null, affiliate: org.org.affiliateEnabled })).html).not.toContain('role="status" class="hairline')
    }
  })

  it('says the company is inactive when both are off', () => {
    const { text, errors } = render(locale, createElement(OwnerConsoleView, { data: owner({ status: 'suspended', affiliateEnabled: false }), actions, report: null, affiliate: false }))
    expect(errors).toEqual([])
    expect(text).toContain(say(locale, 'This company account is inactive', '企业已停用：'))
    expect(text).not.toMatch(/paused|暂停/i)
  })

  it('says where purchases go while the workspace runs, and invites none while it is off', () => {
    expect(render(locale, createElement(PoolPanel, { data: owner(), actions })).text).toContain(say(locale, 'goes straight into the pool', '直接存入积分池'))
    expect(render(locale, createElement(PoolPanel, { data: owner({ status: 'suspended' }), actions })).text).not.toMatch(/purchase|buy|购买/i)
  })

  // Review on #985: with the workspace off, staff codes no longer bring customers to the org and the
  // org signup bonus stops; the banner names only what still works.
  it('names only what still works on the affiliate side while the workspace is off', () => {
    const { text } = render(locale, createElement(OwnerConsoleView, { data: owner({ status: 'suspended' }), actions, report: null, affiliate: true }))
    expect(text).toContain(say(locale, 'Commissions on customers already linked', '已绑定客户的佣金照常计算'))
    expect(text).toContain(say(locale, 'customer referral link in Company affiliate', '企业联盟里的客户推广链接'))
    expect(text).not.toMatch(/as usual|照常。|staff (invite|promo)|员工推广|注册赠分|signup bonus/i)
  })

  it('calls the month table usage without the affiliate program, also when it could not be read', () => {
    for (const r of [report(false), null]) {
      const { text, errors } = render(locale, createElement(PerformancePanel, { report: r, affiliate: false }))
      expect(errors).toEqual([])
      expect(text).toContain(say(locale, 'Monthly usage', '月度使用量'))
      expect(text).not.toMatch(/performance|业绩/i)
    }
    for (const r of [report(true), null]) {
      expect(render(locale, createElement(PerformancePanel, { report: r, affiliate: true })).text).toContain(say(locale, 'Monthly performance', '月度业绩'))
    }
  })
})
