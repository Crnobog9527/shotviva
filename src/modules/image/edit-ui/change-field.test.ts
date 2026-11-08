import { describe, expect, it } from 'vitest'

import { addRequest } from './change-field'

describe('addRequest', () => {
  it('fills an empty field', () => {
    expect(addRequest('  ', '去掉杂物', 500)).toBe('去掉杂物')
  })
  it('joins Chinese with a full-width comma and drops a trailing mark', () => {
    expect(addRequest('换成晴天。', '去掉杂物', 500)).toBe('换成晴天，去掉杂物')
  })
  it('joins English with a comma', () => {
    expect(addRequest('Make it brighter', 'Remove the clutter', 500)).toBe('Make it brighter, Remove the clutter')
  })
  it('does not add a request twice', () => {
    expect(addRequest('去掉杂物', '去掉杂物', 500)).toBe('去掉杂物')
  })
  it('keeps the text when the joined request would not fit', () => {
    expect(addRequest('a'.repeat(10), 'Remove the clutter', 20)).toBe('a'.repeat(10))
  })
})
