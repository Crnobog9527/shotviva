import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import { tierPerks } from '@/core/billing/paywall'
import messages from '@/site/messages/en.json'

// The paywall's English copy (DESIGN §4.5), checked against the keys core/billing/paywall uses.
const t = createTranslator({ locale: 'en', messages, namespace: 'paywall' }) as unknown as (
  key: string,
  values?: Record<string, unknown>,
) => string

describe('paywall messages (en)', () => {
  it('has a message for every perk on every tier, live or coming soon', () => {
    for (const wishlistLive of [true, false]) {
      for (const tier of ['starter', 'pro', 'max'] as const) {
        const perks = tierPerks(tier, { wishlistLive })
        expect(t(`perkHeadings.${perks.heading}`)).not.toMatch(/paywall\./)
        for (const perk of [...perks.live, ...perks.soon]) expect(t(`perks.${perk.key}`, perk.values)).not.toMatch(/paywall\./)
      }
    }
    expect(t('perks.concurrency', { count: 1 })).toBe('1 photo generating at a time')
    expect(t('perks.concurrency', { count: 6 })).toBe('6 photos generating at a time')
    expect(t('perks.earlyAccess')).toBe('Early access to new features')
    // Hours come from TIER_LIMITS.supportHours through the perk values (48 / 48 / 24).
    const support = (tier: 'starter' | 'max') => {
      const perk = tierPerks(tier, { wishlistLive: false }).live.find((p) => p.key.startsWith('support'))
      return perk ? t(`perks.${perk.key}`, perk.values) : null
    }
    expect(support('starter')).toBe('Email support, reply within 48 hours')
    expect(support('max')).toBe('Priority email support, reply within 24 hours')
    expect(t('perks.brandKit')).toBe('Brand kit: your logo and fonts on posters')
  })

  it('words the payment groups as DESIGN §4.5 fixes them', () => {
    expect(t('card')).toBe('Card · Apple Pay · Google Pay')
    expect(t('alipay')).toBe('Alipay')
    // The Stripe wallet line (T73): one checkout offering both.
    expect(t('wallet')).toBe('Alipay / WeChat\u00a0Pay')
    expect(t('cardRenews')).toBe('Renews automatically, cancel anytime')
    expect(t('walletOnce', { period: 'month' })).toBe('One-time payment, 30 days, no auto-renew')
    expect(t('walletOnce', { period: 'year' })).toBe('One-time payment, 1 year, no auto-renew')
    expect(t('oneTime')).toBe('One-time payment')
    // Stripe's cancel_url lands on /pricing?checkout=cancel with this toast (T43).
    expect(String((t as unknown as { rich: (k: string, v: unknown) => unknown }).rich?.('cancelled', { b: (c: string) => c }) ?? '')).toBe('Checkout cancelled. Nothing was charged.')
  })

  it('shows no Chinese on the English paywall', () => {
    const text = JSON.stringify(messages.paywall)
    expect(text).not.toMatch(/[一-鿿]/)
    expect(text).not.toMatch(/queue/i)
  })
})
