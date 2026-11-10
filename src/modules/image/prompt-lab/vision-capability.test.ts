import { describe, expect, it } from 'vitest'
import { supportsVisionModel } from './vision-capability'

describe('verified image-input/text-output capability', () => {
  const id = 'provider/example'
  const entry = (input: string[], output: string[]) => ({ data: [{ id, architecture: { input_modalities: input, output_modalities: output } }] })
  it('requires the exact model and both modalities', () => {
    expect(supportsVisionModel(entry(['image', 'text'], ['text']), id)).toBe(true)
    expect(supportsVisionModel(entry(['image'], ['text']), 'other')).toBe(false)
    expect(supportsVisionModel(entry(['text'], ['text']), id)).toBe(false)
    expect(supportsVisionModel(entry(['image'], ['image']), id)).toBe(false)
    expect(supportsVisionModel({ data: [{ id }] }, id)).toBe(false)
  })
})
