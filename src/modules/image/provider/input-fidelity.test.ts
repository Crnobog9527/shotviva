import { describe, expect, it } from 'vitest'

import { fidelityFor } from './input-fidelity'

describe('fidelityFor (T30)', () => {
  it('keeps the setting for the models that take it', () => {
    expect(fidelityFor('gpt-image-1.5', 'high')).toBe('high')
    expect(fidelityFor('gpt-image-1.5-2025-12-16', 'low')).toBe('low')
    expect(fidelityFor('gpt-image-1', 'high')).toBe('high')
    expect(fidelityFor('gpt-image-1-mini', 'low')).toBe('low')
  })

  it('leaves it out for gpt-image-2 and later, unknown models, a value the model lacks, or none set', () => {
    for (const model of ['gpt-image-2', 'gpt-image-2.5-sunburst', 'gpt-image-2.6', 'gpt-image-10', 'dall-e-3', 'relay-image']) {
      expect(fidelityFor(model, 'high')).toBeUndefined()
    }
    expect(fidelityFor('gpt-image-1-mini', 'high')).toBeUndefined()
    expect(fidelityFor('gpt-image-1.5', undefined)).toBeUndefined()
  })
})
