import { describe, expect, it } from 'vitest'

import { saveEditTemplateSchema } from '../edit-template/schema'

import { canSave, formFor, toSaveInput } from './form-state'

const settings = {
  isActive: false,
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  quality: 'high' as const,
  wrapper: 'W',
  version: 3,
  params: { input_fidelity: 'high', constraints: { fallback: 'c' } },
}

describe('edit template form', () => {
  it('opens a partial row with blanks and round-trips into a valid save', () => {
    const form = formFor(settings)
    expect(form.classifier).toBe('')
    expect(form.constraints).toMatchObject({ fallback: 'c', global: '' })
    expect(canSave(form)).toBe(false)

    const input = toSaveInput({ ...form, classifier: 'classify it' })
    expect(input).toMatchObject({ creditsCost: { '1k': 2, '2k': 4, '3k': 6 }, params: { input_fidelity: 'high', classifier: 'classify it' } })
    expect(saveEditTemplateSchema.safeParse(input).success).toBe(true)
  })

  it('leaves input_fidelity out when set to not send', () => {
    expect(toSaveInput({ ...formFor(settings), inputFidelity: '' }).params).not.toHaveProperty('input_fidelity')
  })
})
