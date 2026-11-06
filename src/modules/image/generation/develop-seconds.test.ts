import { describe, expect, it } from 'vitest'

import { secondsFor } from './develop-seconds'

const table = { '1k': { low: 20, high: 40 }, '2k': { low: 30, high: 50 }, '3k': { low: 40, high: 60 } }

describe('secondsFor', () => {
  it("quotes the photo's own quality", () => {
    expect(secondsFor(table, ['1k'])).toEqual({ low: 20, high: 40 })
    expect(secondsFor(table, ['2k'])).toEqual({ low: 30, high: 50 })
    expect(secondsFor(table, ['3k', '3k'])).toEqual({ low: 40, high: 60 })
  })

  it('spans the fastest to the slowest when qualities are mixed, Standard when there is nothing', () => {
    expect(secondsFor(table, ['1k', '3k'])).toEqual({ low: 20, high: 60 })
    expect(secondsFor(table, [])).toEqual({ low: 20, high: 40 })
  })
})
