import { describe, expect, it, vi } from 'vitest'

import { createLiveConfig, HOLD_MS } from './live-config'

const experiment = { id: 1, surface: 'hero', status: 'running', winner: null, variants: [{ id: 2, option: 'tote', weight: 1, control: true, archived: false, fallback: null }] }

describe('createLiveConfig', () => {
  it('reads once, holds the answer, and refreshes in the background once stale', async () => {
    let now = 0
    const read = vi.fn().mockResolvedValue([experiment])
    const live = createLiveConfig(read, () => now)
    expect(await live()).toHaveLength(1)
    expect(await live()).toHaveLength(1)
    expect(read).toHaveBeenCalledTimes(1)
    now = HOLD_MS + 1
    read.mockResolvedValue([])
    expect(await live()).toHaveLength(1)
    await Promise.resolve()
    await Promise.resolve()
    expect(read).toHaveBeenCalledTimes(2)
    expect(await live()).toHaveLength(0)
  })

  it('serves no experiments when the read fails, times out or returns junk', async () => {
    expect(await createLiveConfig(() => Promise.reject(new Error('down')))()).toEqual([])
    expect(await createLiveConfig(() => Promise.resolve([{ id: 'x' }]))()).toEqual([])
    const slow = createLiveConfig((signal) => new Promise((resolve) => signal.addEventListener('abort', () => resolve([experiment]))), Date.now, 20)
    const started = Date.now()
    expect(await slow()).toEqual([])
    expect(Date.now() - started).toBeLessThan(500)
  })
})
