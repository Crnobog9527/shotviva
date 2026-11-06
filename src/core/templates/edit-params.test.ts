import { describe, expect, it } from 'vitest'

import { editParamsSchema, instructionSchema } from './edit-params'

const constraints = { object: '', background: '', style: '', subject: '', global: '', fallback: '' }

describe('edit template params', () => {
  it('needs the classifier text and all six paragraphs (which may be empty)', () => {
    expect(editParamsSchema.safeParse({ classifier: 'c', constraints }).success).toBe(true)
    expect(editParamsSchema.safeParse({ classifier: ' ', constraints }).success).toBe(false)
    const five = Object.fromEntries(Object.entries(constraints).filter(([scope]) => scope !== 'fallback'))
    expect(editParamsSchema.safeParse({ classifier: 'c', constraints: five }).success).toBe(false)
  })

  it('takes 1–500 characters of instruction after trimming', () => {
    expect(instructionSchema.parse('  沙发换成蓝色 ')).toBe('沙发换成蓝色')
    expect(instructionSchema.safeParse('   ').success).toBe(false)
    expect(instructionSchema.safeParse('x'.repeat(501)).success).toBe(false)
  })
})
