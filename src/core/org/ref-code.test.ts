import { describe, expect, it } from 'vitest'

import { parseRefCode, REF_CODE_ALPHABET, REF_CODE_PATTERN } from './ref-code'

describe('enterprise number', () => {
  it('uses 31 unambiguous characters', () => {
    expect(REF_CODE_ALPHABET).toHaveLength(31)
    expect(new Set(REF_CODE_ALPHABET).size).toBe(31)
    for (const bad of ['0', 'O', '1', 'I', 'L']) expect(REF_CODE_ALPHABET).not.toContain(bad)
  })
  it('accepts SV- plus six alphabet characters only', () => {
    expect(REF_CODE_PATTERN.test('SV-K7M2PX')).toBe(true)
    for (const bad of ['SV-K7M2P', 'SV-K7M2PXA', 'SV-K7M2P0', 'SV-K7M2PO', 'SV-K7M2P1', 'SV-K7M2PI', 'SV-K7M2PL', 'XX-K7M2PX', 'sv-k7m2px', 'SV_K7M2PX', '']) {
      expect(REF_CODE_PATTERN.test(bad)).toBe(false)
    }
  })
  it('parses a search entry case-insensitively and rejects other text', () => {
    expect(parseRefCode(' sv-k7m2px ')).toBe('SV-K7M2PX')
    expect(parseRefCode('SV-K7M2PX')).toBe('SV-K7M2PX')
    expect(parseRefCode('Acme')).toBeNull()
    expect(parseRefCode('SV-K7M2P0')).toBeNull()
  })
})
