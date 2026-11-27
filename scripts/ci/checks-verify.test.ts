import { describe, expect, it } from 'vitest'

import { verify } from './checks-verify.mjs'

// "lint · typecheck · test · build" sums up four parallel jobs (ci.yml): no failure, skip or
// disagreement among them may come out as success.
const part = (result = 'success', code = 'true') => ({ result, outputs: { code } })
const all = (over: Record<string, unknown> = {}) => ({ lint: part(), typecheck: part(), unit: part(), build: part(), ...over })

describe('checks-verify', () => {
  it('passes when all four succeeded with code to check, or all four found docs only', () => {
    expect(verify(all()).ok).toBe(true)
    expect(verify({ lint: part('success', 'false'), typecheck: part('success', 'false'), unit: part('success', 'false'), build: part('success', 'false') }).ok).toBe(true)
  })

  it.each(['failure', 'cancelled', 'skipped'])('fails when a part is %s', (result) => {
    for (const name of ['lint', 'typecheck', 'unit', 'build']) expect(verify(all({ [name]: part(result) })).ok, name).toBe(false)
  })

  it('fails on a missing part, a missing decision, a disagreement or no input', () => {
    expect(verify({ lint: part(), typecheck: part(), build: part() }).ok).toBe(false)
    expect(verify(all({ lint: part('success', '') })).ok).toBe(false)
    expect(verify(all({ unit: { result: 'success' } })).ok).toBe(false)
    expect(verify(all({ typecheck: part('success', 'false') })).ok).toBe(false)
    expect(verify(null).ok).toBe(false)
  })
})
