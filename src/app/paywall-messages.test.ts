import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import { tierPerks } from '@/core/billing/paywall'
import messages from '@/site/messages/en.json'
import zhMessages from '@/site/messages/zh.json'

// The paywall's English copy (DESIGN §4.5), checked against the keys core/billing/paywall uses.
const t = createTranslator({ locale: 'en', messages, namespace: 'paywall' }) as unknown as (
  key: string,
  values?: Record<string, unknown>,
) => string

describe('paywall messages (en)', () => {
  it('has a message for every perk on every tier, live or coming soon', () => {
    for (const wishlistLive of [true, false]) {
      for (const tier of ['starter', 'pro', 'max'] as const) {
        const perks = tierPerks(tier, { wishlistLive, memberPacks: { starter: 5, pro: 10, max: 15 } })
        expect(t(`perkHeadings.${perks.heading}`)).not.toMatch(/paywall\./)
        expect(t(`positioning.${tier}`)).not.toMatch(/paywall\./)
        for (const perk of [...perks.live, ...perks.soon]) expect(t(`perks.${perk.key}`, perk.values)).not.toMatch(/paywall\./)
      }
    }
    expect(t('perks.concurrency', { count: 1 })).toBe('1 photo generating at a time')
    expect(t('perks.concurrency', { count: 6 })).toBe('6 photos generating at a time')
    expect(t('perks.batch', { count: 1 })).toBe('One photo per upload')
    expect(t('perks.batch', { count: 30 })).toBe('Batch upload, up to 30 photos')
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

  it('positions Max for e-commerce batches and words the estimate footnote as the Owner fixed it', () => {
    expect(t('positioning.max')).toMatch(/e-commerce/)
    expect(t('positioning.max')).toMatch(/white-background and lifestyle shots in batches/)
    expect(t('photoEstimateNote')).toBe('Actual count varies: credits per photo depend on the model, resolution and template.')
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

describe('paywall messages: pack note and yearly saving', () => {
  // The new member pack rate (Starter full price) and the revision-2 rate, both locales.
  it('words the pack note from the listed member discounts', () => {
    const zh = createTranslator({ locale: 'zh', messages: zhMessages, namespace: 'paywall' }) as unknown as typeof t
    const o2 = { starter: 0, pro: 5, max: 10 }
    expect(t('packsNoteV2', o2)).toBe('Small packs are full price. On medium and large packs, Pro saves 5% and Max 10%. Each pack includes the same credits for everyone.')
    expect(t('packsNoteV2', { starter: 5, pro: 10, max: 15 })).toContain('Starter saves 5%, Pro 10% and Max 15%.')
    expect(zh('packsNoteV2', o2)).toBe('小包不打折。中包和大包按当前会员等级计价：入门版原价、专业版省 5%、旗舰版省 10%，各会员等级获得的积分数量相同。')
    const markup = (locale: 'en' | 'zh', values: Record<string, unknown>) =>
      createTranslator({ locale, messages: locale === 'en' ? messages : zhMessages, namespace: 'paywall' })
        .markup('savePct', { ...values, b: (chunks: string) => chunks } as never)
    expect(markup('en', { pct: 25, same: 'false', about: 'false' })).toBe('Save up to 25%')
    expect(markup('zh', { pct: 25, same: 'false', about: 'false' })).toBe('最多省 25%')
    expect(markup('en', { pct: 20, same: 'true', about: 'true' })).toBe('Save about 20%')
    expect(markup('zh', { pct: 20, same: 'true', about: 'true' })).toBe('约省 20%')
    expect(markup('zh', { pct: 20, same: 'true', about: 'false' })).toBe('省 20%')
    expect(t('savingAmount', { amount: '$297', pct: 25, about: 'false' })).toBe('$297\u00a0a\u00a0year · 25%\u00a0off')
    expect(t('savingAmount', { amount: '$46.80', pct: 20, about: 'true' })).toBe('$46.80\u00a0a\u00a0year · about\u00a020%\u00a0off')
    expect(zh('savingAmount', { amount: '$46.80', pct: 20, about: 'true' })).toBe('$46.80 · 约省\u00a020%')
    // The yearly plate wraps only at " · ", so a 320-375px card never widens to fit it (2026-11-21).
    for (const render of [t, zh]) for (const about of ['true', 'false']) {
      const halves = render('savingAmount', { amount: '$118.80', pct: 20, about }).split(' · ')
      expect(halves).toHaveLength(2)
      for (const half of halves) expect(half).not.toContain(' ')
    }
    expect(zh('compare.cells.pct', { value: 0 })).toBe('—')
    expect(zh('compare.cells.pct', { value: 10 })).toBe('10%')
  })
})

