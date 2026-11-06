import { describe, expect, it } from 'vitest'

import type { EditParams } from '@/core/templates'

import { composeEditPrompt } from './compose-prompt'

const params: EditParams = {
  questions: { object: 'q', background: 'q', style: 'q', subject: 'q', overall: 'q' },
  constraints: { object: 'C-OBJECT', background: 'C-BACKGROUND', style: '', subject: 'C-SUBJECT', overall: 'C-OVERALL', fallback: 'C-FALLBACK' },
}

describe('composeEditPrompt', () => {
  it('is wrapper, then the range paragraph, then the words as typed', () => {
    expect(composeEditPrompt('WRAPPER', params, 'subject', '把模特换成男生')).toBe('WRAPPER\n\nC-SUBJECT\n\n把模特换成男生')
  })

  it('skips an empty paragraph', () => {
    expect(composeEditPrompt('WRAPPER', params, 'style', 'Make it moody')).toBe('WRAPPER\n\nMake it moody')
  })
})
