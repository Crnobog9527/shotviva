import { describe, expect, it } from 'vitest'
import { planMatrix } from './plan-matrix'

const ids = (length: number) => Array.from({ length }, () => crypto.randomUUID())

describe('prompt lab matrix', () => {
  it('quotes every cell and preserves the displayed row and column order', () => {
    const photoIds = ids(3)
    const versionIds = ids(2)
    const { cells, estimateUsd } = planMatrix({ photoIds, versionIds }, 0.071)
    expect(cells).toHaveLength(6)
    expect(cells[2]).toEqual({ photoId: photoIds[1], versionId: versionIds[0] })
    expect(estimateUsd).toBe(0.426)
  })

  it.each([[1, 12], [12, 1], [3, 4]])('accepts the 12-cell boundary (%i × %i)', (rows, columns) => {
    expect(planMatrix({ photoIds: ids(rows), versionIds: ids(columns) }, 1).cells).toHaveLength(12)
  })

  it.each([[4, 4], [0, 1], [1, 0]])('rejects invalid sizes (%i × %i)', (rows, columns) => {
    expect(() => planMatrix({ photoIds: ids(rows), versionIds: ids(columns) }, 1)).toThrow()
  })

  it('rejects repeated photos and invalid cost quotes', () => {
    const photoIds = ids(1)
    const versionIds = ids(1)
    expect(() => planMatrix({ photoIds: [...photoIds, ...photoIds], versionIds }, 1)).toThrow()
    expect(() => planMatrix({ photoIds, versionIds }, NaN)).toThrow()
  })
})
