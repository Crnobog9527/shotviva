import { describe, expect, it } from 'vitest'

import { eachRecord } from './bulk-outcome'

describe('eachRecord', () => {
  it('files every id once, in the ticked order, as done or skipped with its reason', async () => {
    const seen: string[] = []
    const outcome = await eachRecord(
      ['a', 'b', 'c', 'd', 'a'],
      (id) => (id === 'b' ? 'closed' : null),
      async (id) => {
        seen.push(id)
        if (id === 'c') throw new Error('boom')
      },
      'failed',
    )
    expect(outcome).toEqual({ done: ['a', 'd'], skipped: [{ id: 'b', reason: 'closed' }, { id: 'c', reason: 'failed' }] })
    expect(seen.sort()).toEqual(['a', 'c', 'd'])
  })

  it('never runs more than `width` records at once', async () => {
    let running = 0
    let peak = 0
    await eachRecord(
      Array.from({ length: 12 }, (_, i) => String(i)),
      () => null,
      async () => {
        running += 1
        peak = Math.max(peak, running)
        await new Promise((resolve) => setTimeout(resolve, 1))
        running -= 1
      },
      'failed',
      undefined,
      3,
    )
    expect(peak).toBe(3)
  })
})
