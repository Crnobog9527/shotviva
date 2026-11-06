import { describe, expect, it } from 'vitest'

import type { EditParams } from '@/core/templates'

import { composeEditPrompt } from './compose-prompt'

const params: EditParams = {
  classifier: 'c',
  constraints: { object: 'C-OBJECT', background: 'C-BACKGROUND', style: '', subject: 'C-SUBJECT', global: 'C-GLOBAL', fallback: 'C-FALLBACK' },
}
const keep = ['white ceramic mug', 'wooden table']

describe('composeEditPrompt', () => {
  it('is wrapper, then the range paragraph, then the words as typed', () => {
    expect(composeEditPrompt('WRAPPER', params, 'subject', '把模特换成男生', keep)).toBe('WRAPPER\n\nC-SUBJECT\n\n把模特换成男生')
  })

  it('adds the keep list to object and background paragraphs only', () => {
    expect(composeEditPrompt('W', params, 'background', 'Put it on a beach', keep)).toBe(
      'W\n\nC-BACKGROUND Keep unchanged: white ceramic mug; wooden table.\n\nPut it on a beach',
    )
    expect(composeEditPrompt('W', params, 'object', 'x', keep)).toContain('C-OBJECT Keep unchanged:')
    expect(composeEditPrompt('W', params, 'global', 'x', keep)).not.toContain('Keep unchanged')
    expect(composeEditPrompt('W', params, 'fallback', 'x', keep)).not.toContain('Keep unchanged')
  })

  it('skips an empty paragraph and an empty keep list', () => {
    expect(composeEditPrompt('WRAPPER', params, 'style', 'Make it moody')).toBe('WRAPPER\n\nMake it moody')
    expect(composeEditPrompt('W', params, 'object', 'x', [])).toBe('W\n\nC-OBJECT\n\nx')
  })
})
