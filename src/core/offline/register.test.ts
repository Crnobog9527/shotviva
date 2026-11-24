import { afterEach, describe, expect, it, vi } from 'vitest'

import { keepFirstScreenCovers } from './register'

afterEach(() => vi.unstubAllGlobals())

describe('keepFirstScreenCovers', () => {
  it('names the covers to the active worker once there is one', async () => {
    const postMessage = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ active: { postMessage } }) } })
    keepFirstScreenCovers('all', ['https://img-eo.shotviva.com/assets/presized/v1/w384/covers/x/after-0000000000000000.avif'])
    await Promise.resolve()
    await Promise.resolve()
    expect(postMessage).toHaveBeenCalledWith({ type: 'sv-keep-covers', screen: 'all', urls: ['https://img-eo.shotviva.com/assets/presized/v1/w384/covers/x/after-0000000000000000.avif'] })
  })

  it('does nothing without a worker or without covers, and never throws', () => {
    vi.stubGlobal('navigator', {})
    expect(() => keepFirstScreenCovers('all', ['x'])).not.toThrow()
    const ready = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker: { get ready() { ready(); return new Promise(() => {}) } } })
    keepFirstScreenCovers('all', [])
    expect(ready).not.toHaveBeenCalled()
  })
})
