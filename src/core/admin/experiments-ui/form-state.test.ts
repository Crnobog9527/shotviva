import { describe, expect, it } from 'vitest'

import { emptyForm, nextOption, toSaveInput, withControl, without } from './form-state'

const choices = { hero: [{ id: 'tote', label: 'B 电商' }, { id: 'art-style', label: 'A 画风' }, { id: 'food', label: 'C 餐饮' }] }

describe('experiment form', () => {
  it('starts with the first two options, the first as control, half and half', () => {
    const form = emptyForm(choices)
    expect(form.surface).toBe('hero')
    expect(form.variants.map((variant) => [variant.optionId, variant.weight, variant.isControl])).toEqual([['tote', '50', true], ['art-style', '50', false]])
  })

  it('offers the next unused option and keeps exactly one control', () => {
    const form = emptyForm(choices)
    expect(nextOption(form, choices)?.id).toBe('food')
    expect(withControl(form.variants, 1).map((variant) => variant.isControl)).toEqual([false, true])
    expect(without(form.variants, 0).map((variant) => [variant.optionId, variant.isControl])).toEqual([['art-style', true]])
  })

  it('turns the form into the save input', () => {
    expect(toSaveInput({ ...emptyForm(choices), name: '  首屏测试 ' }, null)).toMatchObject({ id: null, name: '首屏测试', variants: [{ optionId: 'tote', weight: 50, isControl: true }, { optionId: 'art-style', weight: 50, isControl: false }] })
  })
})
