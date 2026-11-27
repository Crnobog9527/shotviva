import { describe, expect, it } from 'vitest'

import { isTemplateShareId, templateShareInputSchema, templateSharePath } from './rules'

const SERIES = '11111111-2222-4333-8444-555555555555'

describe('template share input (§5.1g)', () => {
  it('accepts templates and series in order, trims the title and note', () => {
    const parsed = templateShareInputSchema.parse({ items: [{ type: 'series', id: SERIES }, { type: 'template', id: 'pure-white' }], title: '  Spring  ', note: ' hi ' })
    expect(parsed).toEqual({ items: [{ type: 'series', id: SERIES }, { type: 'template', id: 'pure-white' }], title: 'Spring', note: 'hi' })
  })

  it('refuses no picks, more than 50, duplicates, bad ids and extra fields', () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ type: 'template', id: `t${i}` }))
    for (const items of [[], many, [{ type: 'template', id: 'a' }, { type: 'template', id: 'a' }], [{ type: 'template', id: '../x' }], [{ type: 'series', id: 'dark' }], [{ type: 'template', id: 'a', prompt: 'x' }]]) {
      expect(templateShareInputSchema.safeParse({ items }).success).toBe(false)
    }
    expect(templateShareInputSchema.safeParse({ items: [{ type: 'template', id: 'a' }], title: 'x'.repeat(81) }).success).toBe(false)
    expect(templateShareInputSchema.safeParse({ items: [{ type: 'template', id: 'a' }], userId: 'x' }).success).toBe(false)
  })

  it('knows the link id shape and the page path', () => {
    expect(isTemplateShareId('abc123def456')).toBe(true)
    expect(isTemplateShareId('ABC123def456')).toBe(false)
    expect(isTemplateShareId('abc123')).toBe(false)
    expect(templateSharePath('abc123def456')).toBe('/s/t/abc123def456')
  })
})
