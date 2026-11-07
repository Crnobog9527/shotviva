import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import { methodLabel, methodNote, planFinePrint, pricingMethodNote, type PaywallMessage } from '@/core/billing/paywall'
import { CHECKOUT_METHODS } from '@/core/billing/stripe'
import type { PaymentChannel } from '@/core/config'
import { pricingFaq } from '@/site/content'
import messages from '@/site/messages/en.json'
import zhMessages from '@/site/messages/zh.json'

// ARCHITECTURE §6.3 (T50): on both channels a card plan renews and can be cancelled, Alipay buys
// one period that does not renew, packs are one-time. Waffo only labels the card group "Card".
const t = createTranslator({ locale: 'en', messages, namespace: 'paywall' }) as unknown as (
  key: string,
  values?: Record<string, unknown>,
) => string
const say = (msg: PaywallMessage) => t(msg.key, msg.values)

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
  it('Waffo: the card plan auto-renews and can be cancelled, Alipay does not renew, no WeChat (T50)', () => {
    for (const line of paywallLines('waffo')) {
      expect(line).not.toMatch(/paywall\./)
      expect(line).not.toMatch(/wechat/i)
    }
    expect(say(methodLabel('waffo', 'card'))).toBe('Card')
    expect(say(methodNote('waffo', { kind: 'plan', method: 'card', period: 'year' }))).toBe('Renews automatically, cancel anytime')
    expect(say(methodNote('waffo', { kind: 'plan', method: 'alipay', period: 'month' }))).toBe('One-time payment, 30 days, no auto-renew')
    expect(say(methodNote('waffo', { kind: 'pack', method: 'card', period: 'month' }))).toBe('One-time payment')
    expect(say(planFinePrint('waffo', { method: 'card', period: 'month', price: '$19.90' }))).toBe('Renews monthly at $19.90 · cancel anytime · USD')
    expect(say(planFinePrint('waffo', { method: 'alipay', period: 'year', price: '$191' }))).toBe('One-time payment for 1 year · no auto-renew · USD')
    expect(say(pricingMethodNote('waffo', 'card'))).toBe('Plans renew automatically, cancel anytime')
    expect(say(pricingMethodNote('waffo', 'alipay'))).toBe('One-time payment for 30 days or 1 year, no auto-renew')
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

  // T73: STRIPE_WECHAT_PAY on names both wallets on Stripe; Waffo stays Alipay; the note is the same.
  it('Stripe with STRIPE_WECHAT_PAY on: the wallet line reads Alipay / WeChat Pay, Waffo stays Alipay', () => {
    const zh = createTranslator({ locale: 'zh', messages: zhMessages, namespace: 'paywall' }) as unknown as typeof t
    const sayZh = (msg: PaywallMessage) => zh(msg.key, msg.values)
    // No-break space keeps "WeChat Pay" whole on narrow phones.
    expect(say(methodLabel('stripe', 'alipay', true))).toBe('Alipay / WeChat\u00a0Pay')
    expect(sayZh(methodLabel('stripe', 'alipay', true))).toBe('支付宝 / 微信支付')
    expect(say(methodLabel('waffo', 'alipay', true))).toBe('Alipay')
    expect(sayZh(methodLabel('waffo', 'alipay', true))).toBe('支付宝')
    expect(say(methodLabel('stripe', 'alipay', false))).toBe('Alipay')
    expect(say(methodLabel('stripe', 'card', true))).toBe('Card · Apple Pay · Google Pay')
    expect(sayZh(methodNote('stripe', { kind: 'plan', method: 'alipay', period: 'month' }))).toBe('一次性付款，30 天，不自动续费')
  })

  // 中国银行卡 (T64): worded like a card, plans renew, packs one-time.
  it('Stripe zh: 中国银行卡 renews like a card, packs stay one-time', () => {
    const zh = createTranslator({ locale: 'zh', messages: zhMessages, namespace: 'paywall' }) as unknown as typeof t
    const sayZh = (msg: PaywallMessage) => zh(msg.key, msg.values)
    expect(sayZh(methodLabel('stripe', 'cn_card'))).toBe('中国银行卡')
    // No-break spaces keep "Apple Pay" / "Google Pay" whole when the row wraps at 375.
    expect(sayZh(methodLabel('stripe', 'card'))).toBe('海外银行卡 · Apple\u00a0Pay · Google\u00a0Pay')
    expect(sayZh(methodLabel('stripe', 'alipay'))).toBe('支付宝')
    expect(sayZh(methodNote('stripe', { kind: 'plan', method: 'cn_card', period: 'month' }))).toBe('自动续费，随时可取消')
    expect(sayZh(methodNote('stripe', { kind: 'pack', method: 'cn_card', period: 'month' }))).toBe('一次性付款')
    expect(sayZh(planFinePrint('stripe', { method: 'cn_card', period: 'month', price: '$19.90' }))).toBe('按月以 $19.90 自动续费 · 随时可取消 · 美元')
    expect(sayZh(pricingMethodNote('stripe', 'cn_card'))).toBe('套餐自动续费，随时可取消')
  })

  it('/pricing FAQ: both channels answer how to cancel; Waffo points at Cancel subscription', () => {
    const answer = (channel: PaymentChannel) => pricingFaq(channel).find((item) => item.question === 'How do I cancel my plan?')?.answer
    expect(answer('stripe')).toMatch(/Manage subscription/)
    expect(answer('waffo')).toMatch(/Cancel subscription/)
  })
})
