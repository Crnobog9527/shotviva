import { afterEach, describe, expect, it, vi } from 'vitest'

import { dropStaleShell, keepFirstScreenCovers } from './register'

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

describe('dropStaleShell (the shell switch is off)', () => {
  it('deletes a shell still on the phone and asks the worker to update', async () => {
    const deleted: string[] = []
    const update = vi.fn(async () => undefined)
    vi.stubGlobal('caches', { keys: async () => ['sv-static-dpl_a', 'sv-shell-dpl_a', 'sv-covers', 'other-app'], delete: async (key: string) => void deleted.push(key) })
    await dropStaleShell({ getRegistration: async () => ({ update }) } as unknown as ServiceWorkerContainer)
    expect(deleted).toEqual(['sv-shell-dpl_a'])
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('without a shell: no update request (production keeps the switch off), and never throws', async () => {
    const update = vi.fn()
    vi.stubGlobal('caches', { keys: async () => ['sv-static-dpl_a'], delete: vi.fn() })
    await dropStaleShell({ getRegistration: async () => ({ update }) } as unknown as ServiceWorkerContainer)
    expect(update).not.toHaveBeenCalled()
    vi.stubGlobal('caches', { keys: async () => { throw new Error('blocked') } })
    await expect(dropStaleShell({} as ServiceWorkerContainer)).resolves.toBeUndefined()
  })
})
