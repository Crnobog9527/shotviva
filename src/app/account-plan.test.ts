import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { lastMembership, PlanCard, summarizeSubscription, type LastMembership, type MirrorRow, type SubscriptionSummary } from '@/core/billing/subscription'
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
const cancelWaffo = async () => ({ ok: true })

const SINCE = new Date('2026-11-02T08:00:00Z')

async function render(summary: SubscriptionSummary, locale: 'en' | 'zh' = 'en', paid = 38, last: LastMembership | null = null) {
  const facts = { since: SINCE, email: 'mei@example.test', brand: site.brand.name, last }
  const card: ReactElement = createElement(PlanCard, { summary, products: site.billing.products, paid, manage, cancelWaffo, facts })
  const html = renderToStaticMarkup(createElement(Intl, { locale, messages: await loadMessages(locale), timeZone: 'UTC' }, card))
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
  return { html, text: text.trim() }
}

const row = (patch: Partial<MirrorRow>): MirrorRow => ({
  provider: 'stripe',
  stripeSubscriptionId: 'sub_1',
  waffoOrderId: null,
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
    expect(html).toContain('data-tier="starter"')
    expect(text).toContain('Member Renews Dec 6, 2026 Starter')
    expect(text).toContain('50 credits a month · $19.90 /mo')
    expect(text).toContain('Since Nov 2026 · mei@example.test')
    // The word mark debossed into the card, hidden from screen readers.
    expect(html).toMatch(/aria-hidden="true" class="pass-mark">Shotviva\.</)
    expect(buttons(html)).toEqual(['Manage subscription'])
  })

  it('yearly prices and credits come from site.config', async () => {
    const { text } = await render(summarize([row({ productId: 'max_yearly', currentPeriodEnd: days(300) })], days(300)))
    expect(text).toContain('3,360 credits a year · $713 /yr')
  })

  it('cancelled at period end: Ends date, what stays, Resubscribe first', async () => {
    const { html, text } = await render(summarize([row({ cancelAtPeriodEnd: true })], days(30)))
    expect(html).toContain('data-plan="cancelled"')
    expect(text).toContain('Member Ends Dec 6, 2026 Starter')
    expect(text).toContain('You keep the plan and your credits until Dec 6, 2026; nothing more is charged.')
    expect(buttons(html)).toEqual(['Resubscribe', 'Manage subscription'])
  })

  it('past due: Payment failed, Update payment method through the Portal', async () => {
    const { html, text } = await render(summarize([row({ status: 'past_due' })], days(2)))
    expect(html).toContain('data-flag="bad"')
    expect(text).toContain('Payment failed')
    expect(text).toContain("this period's credits")
    expect(buttons(html)).toEqual(['Update payment method', 'Manage subscription'])
    expect(text).toContain("Opens Stripe's secure billing page")
  })

  it('past due after paid_until ran out says the plan has ended', async () => {
    const { text } = await render(summarize([row({ status: 'unpaid' })], days(-1)))
    expect(text).toContain('so your plan has ended')
  })

})

describe('account Plan card, Waffo card subscription (T50)', () => {
  const waffo = (patch: Partial<MirrorRow> = {}) => row({ provider: 'waffo', stripeSubscriptionId: null, waffoOrderId: 'ORD_1', ...patch })

  it('active: renewal date, price per period, our own Cancel subscription (no Stripe portal)', async () => {
    const { html, text } = await render(summarize([waffo()], days(30)))
    expect(html).toContain('data-plan="active"')
    expect(text).toContain('Member Renews Dec 6, 2026 Starter')
    expect(text).toContain('50 credits a month · $19.90 /mo')
    expect(buttons(html)).toEqual(['Cancel subscription'])
    expect(text).not.toMatch(/Manage subscription|Stripe/)
  })

  it('cancelled: ends at period end, no resubscribe or portal button', async () => {
    const { html, text } = await render(summarize([waffo({ cancelAtPeriodEnd: true })], days(30)))
    expect(html).toContain('data-plan="cancelled"')
    expect(text).toContain('You keep the plan and your credits until Dec 6, 2026; nothing more is charged.')
    expect(buttons(html)).toEqual([])
  })

  it('past due: one more try, then the plan ends; Cancel subscription stays', async () => {
    const { text, html } = await render(summarize([waffo({ status: 'past_due' })], days(2)))
    expect(text).toContain('Payment failed')
    expect(text).toContain('tried once more')
    expect(buttons(html)).toEqual(['Cancel subscription'])
  })

  it('reads in Chinese', async () => {
    const { html, text } = await render(summarize([waffo()], days(30)), 'zh')
    expect(buttons(html)).toEqual(['取消订阅'])
    expect(text).toContain('自动续费')
  })
})

describe('account Plan card without a card subscription', () => {
  it('a one-period Alipay member: Ends date, one month paid with Alipay, Renew with the price', async () => {
    const last = lastMembership([{ productId: 'pack_s', method: 'card' }, { productId: 'pro_monthly', method: 'alipay' }], site.billing.products)
    const { html, text } = await render(summarize([], days(25), 'pro'), 'en', 118, last)
    expect(html).toContain('data-plan="wallet"')
    expect(html).toContain('data-tier="pro"')
    expect(text).toContain('Member Ends Dec 1, 2026 Pro')
    // Tags become spaces in `text`: "paid with <b>Alipay</b>."
    expect(text).toContain('One month, paid with Alipay .')
    expect(text).toContain("It doesn't renew by itself")
    expect(buttons(html)).toEqual(['Renew · $49.90'])
  })

  it('a one-period member paid another way, or of another tier, gets the plain wording and Renew', async () => {
    const { html, text } = await render(summarize([], days(25), 'pro'))
    expect(text).toContain("Paid once, so it doesn't renew by itself")
    expect(buttons(html)).toEqual(['Renew'])
    const maxLast = lastMembership([{ productId: 'max_yearly', method: 'alipay' }], site.billing.products)
    expect(buttons((await render(summarize([], days(25), 'pro'), 'en', 0, maxLast)).html)).toEqual(['Renew'])
  })

  it('expired: No plan, Ended date, the paid credits left still work', async () => {
    const last = lastMembership([{ productId: 'starter_monthly', method: 'card' }], site.billing.products)
    const { html, text } = await render(summarize([row({ status: 'canceled', currentPeriodEnd: days(-1) })], days(-1)), 'en', 12, last)
    expect(html).toContain('data-plan="expired"')
    expect(html).toContain('data-tier="none"')
    expect(text).toContain('Member Ended Nov 5, 2026 No plan')
    expect(text).toContain('Your Starter plan ended. The 12 credits you have left still work')
    expect(buttons(html)).toEqual(['Choose a plan', 'Buy credits'])
    expect((await render(summarize([], days(-1)), 'en', 0)).text).toContain('Your plan ended. Anything you made is still in Photos.')
    expect((await render(summarize([], days(-1)), 'en', 1)).text).toContain('The 1 credit you have left still works')
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
    const last = lastMembership([{ productId: 'pro_monthly', method: 'alipay' }], site.billing.products)
    const wallet = await render(summarize([], days(25), 'pro'), 'zh', 0, last)
    expect(wallet.text).toContain('一次性购买一个月，用 支付宝 付款，不会自动续费')
    expect(buttons(wallet.html)).toEqual(['续费 · $49.90'])
    expect((await render(summarize([row({})], days(30)), 'zh')).text).toContain('加入于 2026年11月 · mei@example.test')
  })
})
