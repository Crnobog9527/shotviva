import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isCaptchaNetworkError } from './captcha-light'

// The on-demand hCaptcha code (widget-loader.ts): a download that stalls or fails is a network
// error after at most WIDGET_LOAD_TIMEOUT_MS, and the next attempt asks again.
type Loader = typeof import('./widget-loader')
const fakeModule = { invisibleToken: vi.fn(), prepareHCaptcha: vi.fn(), releaseWarm: vi.fn() } as unknown as Awaited<ReturnType<Loader['loadWidget']>>

let loader: Loader

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  loader = await import('./widget-loader')
})

afterEach(() => vi.useRealTimers())

describe('loadWidget', () => {
  it('gives up on a download that never answers, as a network error, and asks again next time', async () => {
    const stalled = vi.fn(() => new Promise<never>(() => undefined))
    const first = loader.loadWidget(stalled, 15_000)
    const settled = first.then(
      () => 'resolved',
      (error: unknown) => (isCaptchaNetworkError(error) ? 'network' : 'other'),
    )
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await settled).toBe('network')
    // The stalled request is forgotten: a retry starts a new download.
    const working = vi.fn(async () => fakeModule)
    await expect(loader.loadWidget(working, 15_000)).resolves.toBe(fakeModule)
    expect(stalled).toHaveBeenCalledTimes(1)
    expect(working).toHaveBeenCalledTimes(1)
  })

  it('reports a failed download as a network error', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('ChunkLoadError')))
    const outcome = await loader.loadWidget(failing).then(
      () => 'resolved',
      (error: unknown) => (isCaptchaNetworkError(error) ? 'network' : 'other'),
    )
    expect(outcome).toBe('network')
  })

  it('downloads once for every form and warm-up, and knows when it has arrived', async () => {
    const importer = vi.fn(async () => fakeModule)
    expect(loader.loadedWidget()).toBeNull() // leaving before the warm-up downloads nothing
    await Promise.all([loader.loadWidget(importer), loader.loadWidget(importer)])
    await loader.loadWidget(importer)
    expect(importer).toHaveBeenCalledTimes(1)
    expect(loader.loadedWidget()).toBe(fakeModule)
  })
})
