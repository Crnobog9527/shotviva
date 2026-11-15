import { describe, expect, it } from 'vitest'

import { foodNote } from './runner'

describe('the trial line for a food flow (§5.1c)', () => {
  it('says why a flow fell back, with the reading failure when there is one', () => {
    expect(foodNote({ flow: 'both_off', fallback: 'read_failed', readError: 'openai responses 400 (reasoning mandatory, retried at low)' }))
      .toBe('food_flow fell back to both_off: dish read failed (openai responses 400 (reasoning mandatory, retried at low))')
    expect(foodNote({ flow: 'plating', fallback: 'no_vessel', readError: null })).toBe('food_flow fell back to plating: no_vessel')
  })

  it('says nothing for a flow that ran as asked', () => {
    expect(foodNote({ flow: 'dishware', fallback: null, readError: null })).toBeUndefined()
  })
})
