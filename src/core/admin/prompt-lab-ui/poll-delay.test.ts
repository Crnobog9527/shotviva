import { describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({ labError: String, labRequest: vi.fn() }))
const { pollDelay } = await import('./prompt-lab')

describe('pollDelay', () => {
  it('5 s for the first polls, then slower, at most 20 s', () => {
    expect([0, 1, 2, 3].map(pollDelay)).toEqual([5000, 5000, 5000, 5000])
    expect(pollDelay(4)).toBe(10_000)
    expect(pollDelay(5)).toBe(15_000)
    expect(pollDelay(6)).toBe(20_000)
    expect(pollDelay(50)).toBe(20_000)
  })
})
