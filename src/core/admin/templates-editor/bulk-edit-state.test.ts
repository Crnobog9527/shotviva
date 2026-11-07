import { describe, expect, it } from 'vitest'

import { emptyBulkEdit, readBulkEdit } from './bulk-edit-state'

describe('batch edit form (T79)', () => {
  it('leaves everything alone when nothing is filled in', () => {
    expect(readBulkEdit(emptyBulkEdit())).toEqual({ patch: {}, problems: {} })
  })

  it('turns filled boxes and choices into a patch, tier by tier', () => {
    const values = { ...emptyBulkEdit(), credits: { '1k': '', '2k': ' 5 ', '3k': '' }, surfaces: 'both' as const, quality: 'medium' as const }
    expect(readBulkEdit(values).patch).toEqual({ creditsCost: { '2k': 5 }, visibleIn: ['web', 'partner'], quality: 'medium' })
  })

  it('flags a credit box that is not a whole number from 1 to 999', () => {
    for (const bad of ['0', '1.5', '1000', 'abc', '-2']) {
      const { patch, problems } = readBulkEdit({ ...emptyBulkEdit(), credits: { '1k': bad, '2k': '', '3k': '' } })
      expect(problems['1k']).toBeTruthy()
      expect(patch.creditsCost).toBeUndefined()
    }
  })
})
