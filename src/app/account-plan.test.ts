import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { PlanCard, summarizeSubscription, type MirrorRow, type SubscriptionSummary } from '@/core/billing/subscription'
import { loadMessages } from '@/site/i18n/messages'
import { site } from '@/site/site.config'

// The account Plan card (T39, comps-v3-b/account.html ?sub=…): each state the mirror and
// paid_until can produce says what happens next and offers the one thing to do, in English
// and Chinese. The summaries come from the real summarizeSubscription.

vi.mock('@/core/billing/paywall/paywall-context', () => ({ usePaywall: () => ({ open() {} }) }))

const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: unknown; timeZone: string }>
const now = new Date('2026-11-06T12:00:00Z')
const days = (n: number) => new Date(now.getTime() + n * 86_400_000)
const manage = async () => {}

async function render(summary: SubscriptionSummary, locale: 'en' | 'zh' = 'en', paid = 38) {
  const card: ReactElement = createElement(PlanCard, { summary, products: site.billing.products, paid, manage })
  const html = renderToStaticMarkup(createElement(Intl, { locale, messages: await loadMessages(locale), timeZone: 'UTC' }, card))
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
  return { html, text: text.trim() }
}

const row = (patch: Partial<MirrorRow>): MirrorRow => ({
  stripeSubscriptionId: 'sub_1',
  productId: 'starter_monthly',
  status: 'active',
  currentPeriodEnd: days(30),
  cancelAtPeriodEnd: false,
  ...patch,
})

const summarize = (rows: MirrorRow[], paidUntil: Date | null, tier: 'starter' | 'pro' | 'max' | null = null) =>
  summarizeSubscription({ rows, paidUntil, tier, products: site.billing.products, now })

const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ''))

describe('account Plan card', () => {
  it('active: tier, renewal date, credits and price per period, Manage subscription', async () => {
    const { html, text } = await render(summarize([row({})], days(30)))
    expect(html).toContain('data-plan="active"')
    expect(text).toContain('Starter Renews Dec 6, 2026')
    expect(text).toContain('50 credits a month · $19.90 /mo')
    expect(buttons(html)).toEqual(['Manage subscription'])
  })

  it('yearly prices and credits come from site.config', async () => {
    const { text } = await render(summarize([row({ productId: 'max_yearly', currentPeriodEnd: days(300) })], days(300)))
    expect(text).toContain('3,360 credits a year · $713 /yr')
  })

  it('cancelled at period end: Ends date, what stays, Resubscribe first', async () => {
    const { html, text } = await render(summarize([row({ cancelAtPeriodEnd: true })], days(30)))
    expect(html).toContain('data-plan="cancelled"')
    expect(text).toContain('Ends Dec 6, 2026')
    expect(text).toContain('You keep the plan and your credits until Dec 6, 2026; nothing more is charged.')
    expect(buttons(html)).toEqual(['Resubscribe', 'Manage subscription'])
  })

  it('past due: Payment failed, Update payment method through the Portal', async () => {
    const { html, text } = await render(summarize([row({ status: 'past_due' })], days(2)))
    expect(html).toContain('data-flag="bad"')
    expect(text).toContain('Payment failed')
    expect(text).toContain("this period's credits")
    expect(buttons(html)).toEqual(['Update payment method', 'Manage subscription'])
    expect(text).toContain("Opens Stripe's secure billing page.")
  })

  it('past due after paid_until ran out says the plan has ended', async () => {
    const { text } = await render(summarize([row({ status: 'unpaid' })], days(-1)))
    expect(text).toContain('so your plan has ended')
  })

  it('a one-period (Alipay) member: Ends date, no auto-renew, Renew opens the paywall', async () => {
    const { html, text } = await render(summarize([], days(25), 'pro'))
    expect(html).toContain('data-plan="wallet"')
    expect(text).toContain('Pro Ends Dec 1, 2026')
    expect(text).toContain("doesn't renew by itself")
    expect(buttons(html)).toEqual(['Renew'])
  })

  it('expired: No plan, Ended date, the paid credits left still work', async () => {
    const { html, text } = await render(summarize([row({ status: 'canceled', currentPeriodEnd: days(-1) })], days(-1)), 'en', 12)
    expect(html).toContain('data-plan="expired"')
    expect(text).toContain('No plan Ended Nov 5, 2026')
    expect(text).toContain('The 12 credits you have left still work')
    expect(buttons(html)).toEqual(['Choose a plan', 'Buy credits'])
    expect((await render(summarize([], days(-1)), 'en', 0)).text).toContain('Your plan ended. Anything you made is still in Photos.')
  })

  it('never paid: No plan and Choose a plan only', async () => {
    const { html } = await render(summarize([], null))
    expect(html).toContain('data-plan="free"')
    expect(buttons(html)).toEqual(['Choose a plan'])
  })

  it('speaks Chinese on /zh', async () => {
    // Prices stay in USD in both languages, written "$19.90" like the page copy (ARCHITECTURE §17,
    // 建站规格 G3), never "US$19.90".
    const zh = (await render(summarize([row({})], days(30)), 'zh')).text
    expect(zh).toContain('每月 50 积分 · $19.90 /月')
    expect(zh).not.toContain('US$')
    expect(buttons((await render(summarize([row({ status: 'past_due' })], days(2)), 'zh')).html)).toEqual(['更新付款方式', '管理订阅'])
    expect((await render(summarize([], days(25), 'pro'), 'zh')).text).toContain('专业版')
  })
})
