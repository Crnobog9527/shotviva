import { describe, expect, it } from 'vitest'

import { backgroundInput, isCutOut } from './job-background'

describe('cut-out record (inputs.background)', () => {
  const openai = { honoursBackground: true }

  it('keeps only the one word from the template’s model params', () => {
    expect(backgroundInput({ background: 'transparent', input_fidelity: 'high' }, openai)).toEqual({ background: 'transparent' })
    expect(backgroundInput({ background: 'opaque' }, openai)).toEqual({ background: 'opaque' })
    expect(backgroundInput({ background: 'see-through' }, openai)).toEqual({})
    expect(backgroundInput({}, openai)).toEqual({})
  })

  it('records nothing when the provider drops the setting, so an OpenRouter result is never labelled a cut-out', () => {
    expect(backgroundInput({ background: 'transparent' }, {})).toEqual({})
    expect(backgroundInput({ background: 'transparent' }, { honoursBackground: false })).toEqual({})
  })

  it('is a cut-out only when transparent was asked for; unknown for auto and older works', () => {
    expect(isCutOut({ inputs: { background: 'transparent' } })).toBe(true)
    expect(isCutOut({ inputs: { background: 'opaque' } })).toBe(false)
    expect(isCutOut({ inputs: { background: 'auto' } })).toBeNull()
    expect(isCutOut({ inputs: {} })).toBeNull()
  })
})
