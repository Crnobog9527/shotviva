import { describe, expect, it } from 'vitest'

import { PERSONA_IDS } from './personas'
import { parseResetArgs } from './reset-args'

describe('parseResetArgs (pnpm qa:reset)', () => {
  it('accepts each known persona', () => {
    for (const id of PERSONA_IDS) expect(parseResetArgs([id])).toBe(id)
  })

  it('refuses unknown personas, listing the known ones', () => {
    expect(() => parseResetArgs(['qa-nobody'])).toThrow(/Unknown persona qa-nobody.*qa-admin, qa-creator, qa-fresh, qa-max, qa-free/)
    expect(() => parseResetArgs(['all'])).toThrow(/Unknown persona/)
  })

  it('takes exactly one persona', () => {
    expect(() => parseResetArgs([])).toThrow(/usage: pnpm qa:reset <persona>/)
    expect(() => parseResetArgs(['qa-free', 'qa-max'])).toThrow(/usage/)
  })
})
