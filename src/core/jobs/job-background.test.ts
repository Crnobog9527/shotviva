import { describe, expect, it } from 'vitest'

import { backgroundInput, isCutOut } from './job-background'

describe('cut-out record (inputs.background)', () => {
  it('keeps only the one word from the template’s model params', () => {
    expect(backgroundInput({ background: 'transparent', input_fidelity: 'high' })).toEqual({ background: 'transparent' })
    expect(backgroundInput({ background: 'opaque' })).toEqual({ background: 'opaque' })
    expect(backgroundInput({ background: 'see-through' })).toEqual({})
    expect(backgroundInput({})).toEqual({})
  })

  it('is a cut-out only when transparent was asked for; unknown for auto and older works', () => {
    expect(isCutOut({ inputs: { background: 'transparent' } })).toBe(true)
    expect(isCutOut({ inputs: { background: 'opaque' } })).toBe(false)
    expect(isCutOut({ inputs: { background: 'auto' } })).toBeNull()
    expect(isCutOut({ inputs: {} })).toBeNull()
  })
})
