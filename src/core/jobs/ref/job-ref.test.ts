import { describe, expect, it } from 'vitest'

import { jobRef, jobRefRange, normalizeJobRef } from '.'

const A = '2fa821c6-1a2b-4c3d-8e4f-000000000001'
const B = '2fa821c6-1a2c-4c3d-8e4f-000000000002'
const C = '2fa821c7-0000-4000-8000-000000000003'

describe('normalizeJobRef', () => {
  it('reads 6+ hex digits with or without dashes, any case, with an optional #', () => {
    expect(normalizeJobRef('2FA821')).toBe('2fa821')
    expect(normalizeJobRef(' #2fa821c6 ')).toBe('2fa821c6')
    expect(normalizeJobRef('2fa821c61a2b')).toBe('2fa821c6-1a2b')
    expect(normalizeJobRef('2fa821c6-1a')).toBe('2fa821c6-1a')
    expect(normalizeJobRef(A.toUpperCase())).toBe(A)
  })

  it('rejects short, non-hex and over-long input', () => {
    expect(normalizeJobRef('2fa82')).toBeNull()
    expect(normalizeJobRef('2fa821g6')).toBeNull()
    expect(normalizeJobRef('someone@mail')).toBeNull()
    expect(normalizeJobRef(`${A}0`)).toBeNull()
    expect(normalizeJobRef('')).toBeNull()
  })
})

describe('jobRefRange', () => {
  it('pads the prefix to the lowest and highest uuid that start with it', () => {
    expect(jobRefRange('2fa821')).toEqual({ from: '2fa82100-0000-0000-0000-000000000000', to: '2fa821ff-ffff-ffff-ffff-ffffffffffff' })
    expect(jobRefRange('2fa821c6-1a')).toEqual({ from: '2fa821c6-1a00-0000-0000-000000000000', to: '2fa821c6-1aff-ffff-ffff-ffffffffffff' })
    expect(jobRefRange(A)).toEqual({ from: A, to: A })
  })

  it('contains every id with the prefix and none without', () => {
    const { from, to } = jobRefRange('2fa821c6')
    const inside = (id: string) => id >= from && id <= to
    expect(inside(A) && inside(B)).toBe(true)
    expect(inside(C)).toBe(false)
  })
})

describe('jobRef', () => {
  it('is the first 8 characters when no other job shares them', () => {
    expect(jobRef(A)).toBe('2fa821c6')
    expect(jobRef(A, [A, C])).toBe('2fa821c6')
  })

  it('grows past a shared prefix, never ending on a dash', () => {
    expect(jobRef(A, [A, B])).toBe('2fa821c6-1a2b')
    expect(jobRef(B, [A, B])).toBe('2fa821c6-1a2c')
    expect(jobRef('2fa821c6-1000-4000-8000-000000000000', ['2fa821c6-2000-4000-8000-000000000000'])).toBe('2fa821c6-1')
  })

  it('reads ids in any case', () => {
    expect(jobRef(A.toUpperCase(), [B])).toBe('2fa821c6-1a2b')
  })
})
