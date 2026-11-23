import { describe, expect, it } from 'vitest'

import { canAfford, ctaState, type CtaInput } from './cta-state'

// 1K is paid from free credits only, 2K / 4K from paid credits only (Owner 2026-11-23, 1996).
const base: CtaInput = { balance: { paid: 0, free: 6 }, cost: 2, tier: '1k', running: 0, limit: 2, photo: 'ready' }
const paid: CtaInput = { ...base, tier: '2k', balance: { paid: 4, free: 6 } }

describe('ctaState', () => {
  it('generates from the pool the tier decides', () => {
    expect(ctaState(base)).toEqual({ kind: 'generate', cost: 2, pool: 'free', count: 1 })
    expect(ctaState({ ...paid, cost: 4 })).toEqual({ kind: 'generate', cost: 4, pool: 'paid', count: 1 })
    // Paid credits never pay 1K, free credits never pay 2K.
    expect(ctaState({ ...base, balance: { paid: 50, free: 6 } })).toMatchObject({ kind: 'generate', pool: 'free' })
  })

  it('turns 2K / 4K into Get credits with the paid credits still needed, free credits not counted', () => {
    expect(ctaState({ ...paid, cost: 6, balance: { paid: 1, free: 2 } })).toEqual({ kind: 'get-credits', cost: 6, needed: 5, count: 1 })
    expect(ctaState({ ...paid, tier: '4k', balance: { paid: 0, free: 100 } })).toEqual({ kind: 'get-credits', cost: 2, needed: 2, count: 1 })
  })

  it('says 1K uses free credits only when they cannot cover it, whatever paid credits are left', () => {
    expect(ctaState({ ...base, balance: { paid: 100, free: 1 } })).toEqual({ kind: 'tier-pool', reason: 'free-only', cost: 2, count: 1 })
    expect(ctaState({ ...base, balance: { paid: 0, free: 0 } })).toMatchObject({ kind: 'tier-pool', reason: 'free-only' })
  })

  it('asks to wait when the concurrency limit is reached', () => {
    expect(ctaState({ ...base, running: 2 })).toEqual({ kind: 'wait', limit: 2 })
  })

  it('needs a finished upload before it generates', () => {
    expect(ctaState({ ...base, photo: 'none' }).kind).toBe('need-photo')
    expect(ctaState({ ...base, photo: 'uploading' }).kind).toBe('uploading')
    expect(ctaState({ ...base, copyMissing: true }).kind).toBe('need-copy')
  })

  it('greys a tier its own pool cannot cover', () => {
    expect(canAfford({ paid: 3, free: 3 }, 4, '1k')).toBe(false)
    expect(canAfford({ paid: 0, free: 6 }, 6, '1k')).toBe(true)
    expect(canAfford({ paid: 0, free: 60 }, 6, '2k')).toBe(false)
    expect(canAfford({ paid: 6, free: 0 }, 6, '4k')).toBe(true)
    expect(canAfford({ paid: 60, free: 0 }, 6, '1k')).toBe(false)
  })
})

describe('ctaState: batch balance pre-check (T28)', () => {
  it('charges the whole 2K / 4K batch to the paid pool', () => {
    expect(ctaState({ ...paid, balance: { paid: 20, free: 0 }, count: 10 })).toEqual({ kind: 'generate', cost: 20, pool: 'paid', count: 10 })
  })

  it('never lets free credits make up a batch: Get credits with what the paid pool lacks', () => {
    // 10 × 2 = 20; 12 paid + 30 free would cover a mix, but a batch is paid-only.
    expect(ctaState({ ...paid, balance: { paid: 12, free: 30 }, count: 10 })).toEqual({ kind: 'get-credits', cost: 20, needed: 8, count: 10 })
    expect(ctaState({ ...paid, balance: { paid: 0, free: 30 }, count: 2 })).toMatchObject({ kind: 'get-credits', needed: 4 })
  })

  it('cannot batch 1K (free credits only), even with paid credits to spare', () => {
    expect(ctaState({ ...base, balance: { paid: 100, free: 100 }, count: 3 })).toEqual({ kind: 'tier-pool', reason: 'paid-only', cost: 6, count: 3 })
  })

  it('shows the shortfall while the photos are still uploading', () => {
    expect(ctaState({ ...paid, balance: { paid: 1, free: 0 }, count: 3, photo: 'uploading' })).toMatchObject({ kind: 'get-credits', needed: 5 })
  })

  it('does not wait on the concurrency limit: the batch queues behind running photos', () => {
    expect(ctaState({ ...paid, balance: { paid: 20, free: 0 }, running: 2, count: 10 }).kind).toBe('generate')
  })

  // 「去水印：用付费积分重新生成」 (2026-11-22): free credits must not pay, or the new photo would be
  // marked again; 1K cannot be picked for it, 2K / 4K ask for paid credits when short.
  it('lets only paid credits pay when the run is to remove the watermark', () => {
    expect(ctaState({ ...base, paidOnly: true })).toEqual({ kind: 'tier-pool', reason: 'paid-only', cost: 2, count: 1 })
    expect(ctaState({ ...paid, balance: { paid: 1, free: 6 }, paidOnly: true })).toMatchObject({ kind: 'get-credits', needed: 1 })
    expect(ctaState({ ...paid, balance: { paid: 2, free: 0 }, paidOnly: true })).toMatchObject({ kind: 'generate', pool: 'paid' })
    expect(ctaState(base)).toMatchObject({ kind: 'generate', pool: 'free' })
  })
})
