import { describe, expect, it } from 'vitest'

import { canAfford, ctaState, type CtaInput } from './cta-state'

const base: CtaInput = { balance: { paid: 0, free: 6 }, cost: 2, running: 0, limit: 2, photo: 'ready' }

describe('ctaState', () => {
  it('generates from the pool reserve_credits would use', () => {
    expect(ctaState(base)).toEqual({ kind: 'generate', cost: 2, pool: 'free' })
    expect(ctaState({ ...base, balance: { paid: 4, free: 6 }, cost: 4 })).toEqual({ kind: 'generate', cost: 4, pool: 'paid' })
  })

  it('turns into Get credits with the paid credits still needed', () => {
    expect(ctaState({ ...base, cost: 6, balance: { paid: 1, free: 2 } })).toEqual({ kind: 'get-credits', cost: 6, needed: 5 })
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
