import { NextIntlClientProvider } from 'next-intl'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { CreditDials } from '@/core/account/ui/credit-dials'
import { PlanCard, type SubscriptionSummary } from '@/core/billing/subscription'
import { loadMessages } from '@/site/i18n/messages'
import { site } from '@/site/site.config'

// Org staff buy nothing for themselves (ORG_MEMBER_CHECKOUT), so /account offers them no buy
// button and says where their credits come from instead (Owner 2026-11-28).

vi.mock('@/core/billing/paywall/paywall-context', () => ({ usePaywall: () => ({ open() {} }) }))

const Intl = NextIntlClientProvider as unknown as FunctionComponent<{ locale: string; messages: unknown; timeZone: string }>
async function render(element: ReactElement, locale: 'en' | 'zh') {
  const html = renderToStaticMarkup(createElement(Intl, { locale, messages: await loadMessages(locale), timeZone: 'UTC' }, element))
  return html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

const dials = (buy?: boolean) => createElement(CreditDials, { balance: { paid: 1000, free: 0 }, giftRefused: null, allowance: null, freeGift: site.billing.freeCredits, buy })
const facts = { since: new Date('2026-11-02T08:00:00Z'), email: 'ann@example.test', brand: site.brand.name, last: null }
const free: SubscriptionSummary = { kind: 'free' }
const plan = (buy?: boolean) => createElement(PlanCard, { summary: free, products: site.billing.products, paid: 0, manage: async () => {}, cancelWaffo: async () => ({ ok: true }), facts, buy })

describe.each(['en', 'zh'] as const)('org staff on /account (%s)', (locale) => {
  it('offers no buy link on the credits and says the company gives them', async () => {
    const staff = await render(dials(false), locale)
    expect(staff).not.toMatch(/Buy credits|购买积分/)
    expect(staff).toContain(locale === 'en' ? 'Your company gives you your credits' : '积分由企业分配')
    expect(await render(dials(), locale)).toMatch(/Buy credits|购买积分/)
  })

  it('offers no plan button on the membership card', async () => {
    expect(await render(plan(false), locale)).not.toMatch(/Choose a plan|选择套餐/)
    expect(await render(plan(), locale)).toMatch(/Choose a plan|选择套餐/)
  })
})
