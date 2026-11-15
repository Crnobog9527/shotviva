import { describe, expect, it } from 'vitest'

import { saveEditTemplateSchema } from '../edit-template/schema'

import { canSave, formFor, toSaveInput } from './form-state'

const settings = {
  saleEnabled: true,
  isActive: false,
  creditsCost: { '1k': 2, '2k': 4, '4k': 6 },
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
    expect(input).toMatchObject({ creditsCost: { '1k': 2, '2k': 4, '4k': 6 }, params: { input_fidelity: 'high', classifier: 'classify it' } })
    expect(saveEditTemplateSchema.safeParse(input).success).toBe(true)
  })

  it('leaves input_fidelity out when set to not send', () => {
    expect(toSaveInput({ ...formFor(settings), inputFidelity: '' }).params).not.toHaveProperty('input_fidelity')
  })

  // T47: the reframe paragraph round-trips, and a blank one is not stored.
  it('keeps the reframe paragraph when written, leaves it out when blank', () => {
    const form = { ...formFor({ ...settings, params: { ...settings.params, reframe: 'Extend the frame' } }), classifier: 'c' }
    expect(form.reframe).toBe('Extend the frame')
    expect(toSaveInput(form).params).toMatchObject({ reframe: 'Extend the frame' })
    expect(toSaveInput({ ...form, reframe: '  ' }).params).not.toHaveProperty('reframe')
  })
})

describe('edit template 「出图模型」', () => {
  const line = '00000000-0000-4000-8000-0000000000a1'
  it('opens on the stored line, null following the default line, and saves what was chosen', () => {
    expect(formFor(settings).providerId).toBeNull()
    const form = { ...formFor({ ...settings, providerId: line }), classifier: 'c' }
    expect(form.providerId).toBe(line)
    expect(toSaveInput(form)).toMatchObject({ providerId: line })
    expect(toSaveInput({ ...form, providerId: null })).toMatchObject({ providerId: null })
    expect(saveEditTemplateSchema.safeParse(toSaveInput(form)).success).toBe(true)
    expect(saveEditTemplateSchema.safeParse({ ...toSaveInput(form), providerId: 'not-a-line' }).success).toBe(false)
  })
})
