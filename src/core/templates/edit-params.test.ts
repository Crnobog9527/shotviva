import { describe, expect, it } from 'vitest'

import { editParamsSchema, instructionSchema } from './edit-params'

const questions = { object: 'a', background: 'b', style: 'c', subject: 'd', overall: 'e' }
const constraints = { object: '', background: '', style: '', subject: '', overall: '', fallback: '' }

describe('edit template params', () => {
  it('needs all five questions and all six paragraphs (which may be empty)', () => {
    expect(editParamsSchema.safeParse({ questions, constraints }).success).toBe(true)
    expect(editParamsSchema.safeParse({ questions: { ...questions, overall: ' ' }, constraints }).success).toBe(false)
    const { fallback: _, ...five } = constraints
    expect(editParamsSchema.safeParse({ questions, constraints: five }).success).toBe(false)
  })

  it('takes 1–500 characters of instruction after trimming', () => {
    expect(instructionSchema.parse('  沙发换成蓝色 ')).toBe('沙发换成蓝色')
    expect(instructionSchema.safeParse('   ').success).toBe(false)
    expect(instructionSchema.safeParse('x'.repeat(501)).success).toBe(false)
  })
})
