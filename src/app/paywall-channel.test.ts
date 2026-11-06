import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import { methodLabel, methodNote, planFinePrint, pricingMethodNote, type PaywallMessage } from '@/core/billing/paywall'
import { CHECKOUT_METHODS } from '@/core/billing/stripe'
import type { PaymentChannel } from '@/core/config'
import { pricingFaq } from '@/site/content'
import messages from '@/site/messages/en.json'

// T13 / ARCHITECTURE §6.3: with PAYMENT_CHANNEL=waffo every purchase is one-time, so the paywall
// and /pricing must not mention renewing or cancelling anywhere; on Stripe the copy is unchanged.
const t = createTranslator({ locale: 'en', messages, namespace: 'paywall' }) as unknown as (
  key: string,
  values?: Record<string, unknown>,
) => string
const say = (msg: PaywallMessage) => t(msg.key, msg.values)

// "No subscription" on the packs stays: it is true on both channels.
const RENEWAL = /renew|cancel|recurr|automatic/i
const PERIODS = ['month', 'year'] as const

function paywallLines(channel: PaymentChannel): string[] {
  const lines: string[] = []
  for (const method of CHECKOUT_METHODS) {
    lines.push(say(methodLabel(channel, method)), say(pricingMethodNote(channel, method)))
    for (const period of PERIODS) {
      for (const kind of ['plan', 'pack'] as const) lines.push(say(methodNote(channel, { kind, method, period })))
      lines.push(say(planFinePrint(channel, { method, period, price: '$19.90' })))
    }
  }
  return lines
}

describe('payment copy by channel', () => {
  it('Waffo: no renewal or cancel wording on any paywall line, and no WeChat', () => {
    const lines = paywallLines('waffo')
    for (const line of lines) {
      expect(line).not.toMatch(/paywall\./)
      expect(line).not.toMatch(RENEWAL)
      expect(line).not.toMatch(/wechat/i)
    }
    expect(say(methodLabel('waffo', 'card'))).toBe('Card')
    expect(say(planFinePrint('waffo', { method: 'card', period: 'month', price: '$19.90' }))).toBe('One-time payment for 30 days · USD')
    expect(say(methodNote('waffo', { kind: 'plan', method: 'card', period: 'year' }))).toBe('One-time payment, 1 year')
  })

  it('Stripe: the card plan still says it renews, Alipay still says one period', () => {
    expect(say(methodLabel('stripe', 'card'))).toBe('Card · Apple Pay · Google Pay')
    expect(say(methodNote('stripe', { kind: 'plan', method: 'card', period: 'month' }))).toBe('Renews automatically, cancel anytime')
    expect(say(planFinePrint('stripe', { method: 'card', period: 'year', price: '$191' }))).toBe('Renews yearly at $191 · cancel anytime · USD')
    expect(say(planFinePrint('stripe', { method: 'alipay', period: 'month', price: '$19.90' }))).toMatch(/^One-time payment for 30 days/)
    expect(say(pricingMethodNote('stripe', 'card'))).toBe('Plans renew automatically, cancel anytime')
    expect(say(pricingMethodNote('stripe', 'alipay'))).toBe('One-time payment for 30 days or 1 year, no auto-renew')
    expect(t('payNotePacks')).toBe('Credit packs are always a one-time payment.')
  })

  it('/pricing: Waffo drops the renewal lines and the cancel question; Stripe keeps them', () => {
    const waffo = [t('payNotePacks'), ...CHECKOUT_METHODS.map((m) => say(pricingMethodNote('waffo', m))), ...pricingFaq('waffo').flatMap((item) => [item.question, item.answer])]
    for (const line of waffo) expect(line).not.toMatch(RENEWAL)
    expect(pricingFaq('waffo').length).toBeGreaterThan(0)

    expect(pricingFaq('stripe').map((item) => item.question)).toContain('How do I cancel my plan?')
  })
})
