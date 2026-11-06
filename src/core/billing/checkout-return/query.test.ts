import { describe, expect, it } from 'vitest'

import { partnerParams, readReturnQuery } from './query'

describe('checkout return address', () => {
  it('reads a Stripe session id, or a Waffo product, and nothing else', () => {
    expect(readReturnQuery({ session_id: 'cs_test_a1B2c3D4e5' })).toEqual({ channel: 'stripe', sessionId: 'cs_test_a1B2c3D4e5' })
    expect(readReturnQuery({ channel: 'waffo', p: 'pack_m' })).toEqual({ channel: 'waffo', productId: 'pack_m' })
    // The unfilled placeholder, someone else's id shape, an unknown product, nothing.
    expect(readReturnQuery({ session_id: '{CHECKOUT_SESSION_ID}' })).toBeNull()
    expect(readReturnQuery({ session_id: 'in_123456789' })).toBeNull()
    expect(readReturnQuery({ channel: 'waffo', p: 'pack_x' })).toBeNull()
    expect(readReturnQuery({ p: 'pack_m' })).toBeNull()
    expect(readReturnQuery({ session_id: ['cs_test_a1B2c3D4e5'] })).toBeNull()
    expect(readReturnQuery({})).toBeNull()
  })

  it('passes the Graylum way back through', () => {
    expect(partnerParams({ from: 'graylum', return_to: 'https://graylum.com/x' })).toEqual({ from: 'graylum', return_to: 'https://graylum.com/x' })
    expect(partnerParams({})).toEqual({ from: null, return_to: null })
  })
})
