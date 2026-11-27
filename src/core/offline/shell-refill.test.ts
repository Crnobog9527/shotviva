import { describe, expect, it, vi } from 'vitest'

import { CACHE_WAIT_MS, serviceWorkerSource } from './sw'
import { BUILD, nav, on, runWorker } from './shell-worker-harness'

// The refill of a shell the replaced worker deleted after install (shell-worker.ts refillShells).
describe('the shell refill after install happens once per build, not once per wake', () => {
  const shellFetches = (worker: ReturnType<typeof runWorker>) =>
    worker.fetch.mock.calls.map(([input]) => input).filter((input) => typeof input === 'string' && input.includes('/app-shell/'))

  it('a failed refill is not retried, neither later in this run nor after the browser restarts the worker', async () => {
    const first = runWorker(on)
    await first.dispatch('activate', {})
    first.fetch.mockImplementation(async (input: unknown) => {
      if (String(input).includes('/app-shell/')) throw new Error('cross-border stall')
      return new Response('page', { status: 200 })
    })
    await first.dispatch('fetch', nav('/photos'))
    expect(shellFetches(first)).toHaveLength(2)
    const restarted = runWorker(on, first.stores)
    await restarted.dispatch('fetch', nav('/photos'))
    await restarted.dispatch('fetch', nav('/zh'))
    expect(shellFetches(restarted)).toEqual([])
    expect(first.stores.has(`sv-shell-${BUILD}`)).toBe(false)
  })

  it('a record that cannot be read in time (stalled Cache Storage) means no refill, and nothing written', async () => {
    vi.useFakeTimers()
    try {
      const worker = runWorker(on)
      worker.caches.has.mockImplementation(() => new Promise<boolean>(() => {}))
      const navigated = worker.dispatch('fetch', nav('/photos'))
      await vi.advanceTimersByTimeAsync(CACHE_WAIT_MS)
      await navigated
      expect(shellFetches(worker)).toEqual([])
      expect(worker.caches.open).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a record that cannot be written means no refill', async () => {
    const worker = runWorker(on)
    worker.caches.open.mockImplementation(async () => {
      throw new Error('quota')
    })
    await worker.dispatch('fetch', nav('/photos'))
    expect(shellFetches(worker)).toEqual([])
  })

  it('the record is kept across activation and goes with the next build', async () => {
    const worker = runWorker(on)
    await worker.dispatch('fetch', nav('/photos'))
    expect(worker.stores.has(`sv-checked-${BUILD}`)).toBe(true)
    await worker.dispatch('activate', {})
    expect(worker.stores.has(`sv-checked-${BUILD}`)).toBe(true)
    const next = runWorker(serviceWorkerSource({ version: 'dpl_next', cdnOrigins: [], enabled: true, shell: true }), worker.stores)
    await next.dispatch('activate', {})
    expect(worker.stores.has(`sv-checked-${BUILD}`)).toBe(false)
  })
})
