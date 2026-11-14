import { describe, expect, it, vi } from 'vitest'

import { createLiveConfig, HOLD_MS, STALE_LIMIT_MS } from './live-config'

const experiment = { id: 1, surface: 'hero', status: 'running', winner: null, variants: [{ id: 2, option: 'tote', weight: 1, control: true, archived: false, fallback: null }] }
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createLiveConfig', () => {
  it('reads once, holds the answer, and refreshes in the background once stale', async () => {
    let now = 0
    const read = vi.fn().mockResolvedValue([experiment])
    const live = createLiveConfig(read, { now: () => now })
    expect(await live()).toHaveLength(1)
    expect(await live()).toHaveLength(1)
    expect(read).toHaveBeenCalledTimes(1)
    now = HOLD_MS + 1
    read.mockResolvedValue([])
    expect(await live()).toHaveLength(1)
    await settle()
    expect(read).toHaveBeenCalledTimes(2)
    expect(await live()).toHaveLength(0)
  })

  it('answers the first request after the short wait, and the slow read still fills the hold', async () => {
    let finish: (value: unknown) => void = () => {}
    const read = vi.fn(() => new Promise((resolve) => (finish = resolve)))
    const live = createLiveConfig(read, { firstWaitMs: 20 })
    const started = Date.now()
    expect(await live()).toEqual([])
    expect(Date.now() - started).toBeLessThan(500)
    finish([experiment])
    await settle()
    expect(await live()).toHaveLength(1)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('keeps the last good answer through failed refreshes, for a limited time', async () => {
    let now = 0
    const read = vi.fn().mockResolvedValue([experiment])
    const live = createLiveConfig(read, { now: () => now })
    await live()
    read.mockRejectedValue(new Error('down'))
    now = HOLD_MS + 1
    await live()
    await settle()
    expect(await live()).toHaveLength(1)
    now = STALE_LIMIT_MS + 1
    await live()
    await settle()
    expect(await live()).toEqual([])
  })

  it('serves no experiments when the first read fails or returns junk', async () => {
    expect(await createLiveConfig(() => Promise.reject(new Error('down')))()).toEqual([])
    expect(await createLiveConfig(() => Promise.resolve([{ id: 'x' }]))()).toEqual([])
  })

  it('cancels a refresh that takes too long', async () => {
    let aborted = false
    const read = (signal: AbortSignal) => new Promise((_, reject) => signal.addEventListener('abort', () => ((aborted = true), reject(new Error('aborted')))))
    expect(await createLiveConfig(read, { firstWaitMs: 5, refreshTimeoutMs: 20 })()).toEqual([])
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(aborted).toBe(true)
  })
})
