import { describe, expect, it } from 'vitest'

import { signupGrantKey } from '../../src/core/billing/credits'
import { site } from '../../src/site/site.config'
import { creatorJobId } from './creator-work'
import {
  MAX_PRODUCT_CREDITS,
  MAX_PRODUCT_ID,
  needsRecreate,
  PERSONAS,
  resetKey,
  SIGNUP_FREE_CREDITS,
  signupKey,
} from './personas'

const userId = '7d1c3c2e-56f1-4f47-9f0c-3a7e6c1f2b10'
const fresh = { credits: 0, paidUntil: null, tier: null }

describe('persona constants', () => {
  it('match the app (signup grant key and amount, Max product)', () => {
    expect(signupKey(userId)).toBe(signupGrantKey(userId))
    expect(SIGNUP_FREE_CREDITS).toBe(site.billing.freeCredits)
    const max = site.billing.products.find((p) => p.id === MAX_PRODUCT_ID)
    expect(max).toMatchObject({ tier: 'max', credits: MAX_PRODUCT_CREDITS })
  })

  it('use fixed emails on the shotviva.com domain', () => {
    for (const persona of Object.values(PERSONAS)) expect(persona.email).toBe(`${persona.id}@shotviva.com`)
  })
})

describe('needsRecreate', () => {
  it('always recreates qa-fresh', () => {
    expect(needsRecreate(PERSONAS['qa-fresh'], fresh)).toBe(true)
  })

  it('recreates qa-free once it has paid for anything', () => {
    expect(needsRecreate(PERSONAS['qa-free'], fresh)).toBe(false)
    expect(needsRecreate(PERSONAS['qa-free'], { ...fresh, credits: 20 })).toBe(true)
    expect(needsRecreate(PERSONAS['qa-free'], { ...fresh, paidUntil: '2027-01-01T00:00:00Z' })).toBe(true)
  })

  it('recreates qa-max when it is no longer on Max', () => {
    expect(needsRecreate(PERSONAS['qa-max'], { credits: 3360, paidUntil: '2027-11-06', tier: 'max' })).toBe(false)
    expect(needsRecreate(PERSONAS['qa-max'], { credits: 50, paidUntil: '2027-11-06', tier: 'starter' })).toBe(true)
  })

  it('never recreates qa-admin or qa-creator', () => {
    const drifted = { credits: 999, paidUntil: '2027-01-01', tier: 'pro' }
    expect(needsRecreate(PERSONAS['qa-admin'], drifted)).toBe(false)
    expect(needsRecreate(PERSONAS['qa-creator'], drifted)).toBe(false)
  })
})

describe('deterministic ids and keys', () => {
  it('gives qa-creator the same valid job id every run', () => {
    const id = creatorJobId(userId)
    expect(id).toBe(creatorJobId(userId))
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(creatorJobId('00000000-0000-4000-8000-000000000000')).not.toBe(id)
  })

  it('moves the reset key only with the ledger', () => {
    expect(resetKey(userId, 'paid', 41)).toBe(resetKey(userId, 'paid', 41))
    expect(resetKey(userId, 'paid', 41)).not.toBe(resetKey(userId, 'paid', 42))
    expect(resetKey(userId, 'paid', 41)).not.toBe(resetKey(userId, 'free', 41))
  })
})
