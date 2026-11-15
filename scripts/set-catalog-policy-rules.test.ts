import { describe, expect, it } from 'vitest'

import { checkPolicyTarget, parsePolicy } from './set-catalog-policy-rules'

// Synthetic values only.
const policy = { payment_bp: 100, refund_bp: 200, yearly_commission_bp: 300, other_commission_bp: 400, margin_bp: 5000 }

describe('catalog policy script', () => {
  it('accepts exactly the five basis-point integers', () => {
    expect(parsePolicy(Object.fromEntries(Object.entries(policy).reverse()))).toEqual(policy)
    expect(() => parsePolicy({ ...policy, extra: 1 })).toThrow(/Invalid/)
    expect(() => parsePolicy({ ...policy, refund_bp: 1.5 })).toThrow(/Invalid/)
    expect(() => parsePolicy({ ...policy, refund_bp: '200' })).toThrow(/Invalid/)
    expect(() => parsePolicy({ ...policy, payment_bp: 10000 })).toThrow(/Invalid/)
    const missing: Partial<typeof policy> = { ...policy }
    delete missing.margin_bp
    expect(() => parsePolicy(missing)).toThrow(/Invalid/)
    expect(() => parsePolicy({ ...policy, payment_bp: 5000, refund_bp: 4000, other_commission_bp: 1000 })).toThrow(/10000/)
  })

  it('writes only to known databases, production only with --prod', () => {
    expect(checkPolicyTarget('https://pnzkiqvktkzznfbyhphe.supabase.co', false)).toBe('test')
    expect(() => checkPolicyTarget('https://pnzkiqvktkzznfbyhphe.supabase.co', true)).toThrow(/test database/)
    expect(() => checkPolicyTarget('https://irbqamjuazkkyvnnzupf.supabase.co', false)).toThrow(/--prod/)
    expect(checkPolicyTarget('https://irbqamjuazkkyvnnzupf.supabase.co', true)).toBe('production')
    expect(checkPolicyTarget('http://127.0.0.1:54321', false)).toBe('local')
    expect(() => checkPolicyTarget('https://other.supabase.co', true)).toThrow(/Unknown/)
  })
})
