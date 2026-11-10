import { describe, expect, it } from 'vitest'

import { emptyBulkEdit, readBulkEdit } from './bulk-edit-state'

describe('batch edit form (T79)', () => {
  it('leaves everything alone when nothing is filled in', () => {
    expect(readBulkEdit(emptyBulkEdit())).toEqual({ patch: {}, problems: {} })
  })

  it('turns filled boxes and choices into a patch, tier by tier', () => {
    const values = { ...emptyBulkEdit(), credits: { '1k': '', '2k': ' 5 ', '3k': '' }, surfaces: 'both' as const, quality: 'medium' as const, category: 'pets' }
    expect(readBulkEdit(values).patch).toEqual({ creditsCost: { '2k': 5 }, visibleIn: ['web', 'partner'], quality: 'medium', categoryKey: 'pets' })
  })

  it('flags a credit box that is not a whole number from 1 to 999', () => {
    for (const bad of ['0', '1.5', '1000', 'abc', '-2']) {
      const { patch, problems } = readBulkEdit({ ...emptyBulkEdit(), credits: { '1k': bad, '2k': '', '3k': '' } })
      expect(problems['1k']).toBeTruthy()
      expect(patch.creditsCost).toBeUndefined()
    }
  })
})

it('distinguishes keeping a binding, following the default, and selecting a model', () => {
  const form = emptyBulkEdit()
  expect(readBulkEdit(form).patch).not.toHaveProperty('providerId')
  expect(readBulkEdit({ ...form, provider: '' }).patch).toEqual({ providerId: null })
  expect(readBulkEdit({ ...form, provider: 'seed' }).patch).toEqual({ providerId: 'seed' })
})
