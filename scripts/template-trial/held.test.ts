import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { heldFor, HOLD_MS } = await import('./providers')

describe('heldFor (provider rows and keys held by the trial process)', () => {
  it('answers a repeat within the hold from memory, and reads again after it', async () => {
    let t = 0
    const read = vi.fn(async (id: string) => `${id}:${read.mock.calls.length}`)
    const held = heldFor(read, HOLD_MS, () => t)
    expect(await held('a')).toBe('a:1')
    t = HOLD_MS - 1
    expect(await held('a')).toBe('a:1')
    expect(await held('b')).toBe('b:2')
    t = HOLD_MS
    expect(await held('a')).toBe('a:3')
  })

  it('does not keep a failed read', async () => {
    let fail = true
    const read = vi.fn(async () => { if (fail) throw new Error('down'); return 'ok' })
    const held = heldFor(read, HOLD_MS, () => 0)
    await expect(held('x')).rejects.toThrow('down')
    fail = false
    expect(await held('x')).toBe('ok')
    expect(read).toHaveBeenCalledTimes(2)
  })
})
