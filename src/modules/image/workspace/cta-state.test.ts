import { describe, expect, it } from 'vitest'

import { canAfford, ctaState, type CtaInput } from './cta-state'

const base: CtaInput = { balance: { paid: 0, free: 6 }, cost: 2, running: 0, limit: 2, photo: 'ready' }

describe('ctaState', () => {
  it('generates from the pool reserve_credits would use', () => {
    expect(ctaState(base)).toEqual({ kind: 'generate', cost: 2, pool: 'free', count: 1 })
    expect(ctaState({ ...base, balance: { paid: 4, free: 6 }, cost: 4 })).toEqual({ kind: 'generate', cost: 4, pool: 'paid', count: 1 })
  })

  it('turns into Get credits with the paid credits still needed', () => {
    expect(ctaState({ ...base, cost: 6, balance: { paid: 1, free: 2 } })).toEqual({ kind: 'get-credits', cost: 6, needed: 5, count: 1 })
  })

  it('asks to wait when the concurrency limit is reached', () => {
    expect(ctaState({ ...base, running: 2 })).toEqual({ kind: 'wait', limit: 2 })
  })

  it('needs a finished upload before it generates', () => {
    expect(ctaState({ ...base, photo: 'none' }).kind).toBe('need-photo')
    expect(ctaState({ ...base, photo: 'uploading' }).kind).toBe('uploading')
    expect(ctaState({ ...base, copyMissing: true }).kind).toBe('need-copy')
  })

  it('greys tiers neither pool covers', () => {
    expect(canAfford({ paid: 3, free: 3 }, 4)).toBe(false)
    expect(canAfford({ paid: 0, free: 6 }, 6)).toBe(true)
  })
})

describe('ctaState: batch balance pre-check (T28)', () => {
  it('charges the whole batch to the paid pool', () => {
    expect(ctaState({ ...base, balance: { paid: 20, free: 0 }, count: 10 })).toEqual({ kind: 'generate', cost: 20, pool: 'paid', count: 10 })
  })

  it('never lets free credits make up a batch: Get credits with what the paid pool lacks', () => {
    // 10 × 2 = 20; 12 paid + 30 free would cover a mix, but a batch is paid-only.
    expect(ctaState({ ...base, balance: { paid: 12, free: 30 }, count: 10 })).toEqual({ kind: 'get-credits', cost: 20, needed: 8, count: 10 })
    expect(ctaState({ ...base, balance: { paid: 0, free: 30 }, count: 2 })).toMatchObject({ kind: 'get-credits', needed: 4 })
  })

  it('shows the shortfall while the photos are still uploading', () => {
    expect(ctaState({ ...base, balance: { paid: 1, free: 0 }, count: 3, photo: 'uploading' })).toMatchObject({ kind: 'get-credits', needed: 5 })
  })

  it('does not wait on the concurrency limit: the batch queues behind running photos', () => {
    expect(ctaState({ ...base, balance: { paid: 20, free: 0 }, running: 2, count: 10 }).kind).toBe('generate')
  })
})
