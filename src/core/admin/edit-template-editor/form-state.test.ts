import { describe, expect, it } from 'vitest'

import { saveEditTemplateSchema } from '../edit-template/schema'

import { formFor, missingQuestions, toSaveInput } from './form-state'

const settings = {
  isActive: false,
  creditsCost: { '1k': 2, '2k': 4, '3k': 6 },
  quality: 'high' as const,
  wrapper: 'W',
  version: 3,
  params: { input_fidelity: 'high', questions: { object: 'q1' }, constraints: { fallback: 'c' } },
}

describe('edit template form', () => {
  it('opens a partial row with blanks and round-trips into a valid save', () => {
    const form = formFor(settings)
    expect(form.questions.background).toBe('')
    expect(form.constraints.fallback).toBe('c')
    expect(missingQuestions(form)).toEqual(['background', 'style', 'subject', 'overall'])

    const filled = { ...form, questions: { object: 'a', background: 'b', style: 'c', subject: 'd', overall: 'e' } }
    const input = toSaveInput(filled)
    expect(input).toMatchObject({ creditsCost: { '1k': 2, '2k': 4, '3k': 6 }, params: { input_fidelity: 'high' } })
    expect(saveEditTemplateSchema.safeParse(input).success).toBe(true)
  })

  it('leaves input_fidelity out when set to not send', () => {
    expect(toSaveInput({ ...formFor(settings), inputFidelity: '' }).params).not.toHaveProperty('input_fidelity')
  })
})
