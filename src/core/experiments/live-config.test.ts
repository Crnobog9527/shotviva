import { describe, expect, it, vi } from 'vitest'

import { createLiveConfig, HOLD_MS, STALE_LIMIT_MS } from './live-config'

const experiment = { id: 1, surface: 'hero', status: 'running', winner: null, variants: [{ id: 2, option: 'tote', weight: 1, control: true, archived: false, fallback: null }] }
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createLiveConfig', () => {
  it('reads once, holds the answer, and refreshes in the background once stale', async () => {
    let now = 0
    const read = vi.fn().mockResolvedValue([experiment])
    const live = createLiveConfig(read, { now: () => now })
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>()
    const onRead = vi.fn()
    const access = { waitUntil, onRead }
    expect(await live(access)).toHaveLength(1)
    expect(await live(access)).toHaveLength(1)
    expect(read).toHaveBeenCalledTimes(1)
    expect(waitUntil).toHaveBeenCalledTimes(1)
    now = HOLD_MS + 1
    read.mockResolvedValue([])
    expect(await live(access)).toHaveLength(1)
    expect(waitUntil).toHaveBeenCalledTimes(2)
    await waitUntil.mock.calls[1]?.[0]
    expect(read).toHaveBeenCalledTimes(2)
    expect(await live(access)).toHaveLength(0)
    expect(onRead.mock.calls.flat()).toEqual(['cold', 'fresh', 'stale', 'fresh'])
  })

  it('answers the first request after the short wait, and the slow read still fills the hold', async () => {
    let finish: (value: unknown) => void = () => {}
    const read = vi.fn(() => new Promise((resolve) => (finish = resolve)))
    const live = createLiveConfig(read, { firstWaitMs: 20 })
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>()
    const secondWaitUntil = vi.fn()
    const request = live({ waitUntil })
    const concurrent = live({ waitUntil: secondWaitUntil })
    expect(await Promise.all([request, concurrent])).toEqual([[], []])
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(secondWaitUntil).not.toHaveBeenCalled()
    finish([experiment])
    await waitUntil.mock.calls[0]?.[0]
    expect(await live({ waitUntil })).toHaveLength(1)
    expect(read).toHaveBeenCalledTimes(1)
  })
})

describe('createLiveConfig failures', () => {
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
