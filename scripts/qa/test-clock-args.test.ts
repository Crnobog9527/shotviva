import { describe, expect, it } from 'vitest'

import { nextFrozenTime, parseClockArgs } from './test-clock-args'

describe('parseClockArgs', () => {
  it('takes list, advance <clock> and delete <clock>', () => {
    expect(parseClockArgs(['list'])).toEqual({ command: 'list' })
    expect(parseClockArgs(['advance', 'clock_1AbC'])).toEqual({ command: 'advance', clock: 'clock_1AbC' })
    expect(parseClockArgs(['delete', 'clock_1AbC'])).toEqual({ command: 'delete', clock: 'clock_1AbC' })
  })

  it('refuses anything else before touching Stripe', () => {
    for (const argv of [[], ['advance'], ['advance', 'cus_1'], ['delete', 'clock_1', 'extra'], ['list', 'clock_1'], ['reset']]) {
      expect(() => parseClockArgs(argv)).toThrow(/usage/)
    }
  })
})

describe('nextFrozenTime', () => {
  it('lands one hour past the latest period end', () => {
    expect(nextFrozenTime(1000, [5000, 9000])).toBe(9000 + 3600)
  })

  it('never moves backwards and refuses a clock with nothing due', () => {
    expect(nextFrozenTime(20000, [5000])).toBe(20000 + 3600)
    expect(() => nextFrozenTime(1000, [])).toThrow(/no subscription/)
    expect(() => nextFrozenTime(1000, [0])).toThrow(/no subscription/)
  })
})
