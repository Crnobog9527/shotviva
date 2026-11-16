import { describe, expect, it, vi } from 'vitest'

import { captureErrorWith, type SentryApi } from '../capture-scope'
import { createSdk, MAX_QUEUED } from './sdk'

describe('deferred browser SDKs', () => {
  it('drains just its own jobs in order, with a bounded queue', async () => {
    const channel = createSdk<(value: number | string) => void>()
    const capture = vi.fn()
    for (let i = 0; i < MAX_QUEUED + 10; i++) channel.run((sdk) => sdk(i))
    expect(capture).not.toHaveBeenCalled()
    await channel.load(async () => capture)
    channel.run((sdk) => sdk('later'))
    expect(capture.mock.calls.flat()).toEqual([...Array.from({ length: MAX_QUEUED }, (_, i) => i), 'later'])
  })

  it('keeps reporting after a failing analytics job', async () => {
    const channel = createSdk<(value: string) => void>()
    const capture = vi.fn()
    channel.run(() => { throw new Error('boom') })
    channel.run((sdk) => sdk('after'))
    await channel.load(async () => capture)
    channel.run(() => { throw new Error('boom again') })
    expect(capture).toHaveBeenCalledWith('after')
  })

  it('reports a queued Sentry error while the other SDK is unresolved or blocked', async () => {
    const scope = { setTag: vi.fn(), setLevel: vi.fn(), setContext: vi.fn() }
    const captureException = vi.fn()
    const sdk = { withScope: (fn: (s: typeof scope) => void) => fn(scope), captureException } as unknown as SentryApi
    const sentry = createSdk<SentryApi>()
    const posthog = createSdk<object>()
    const error = new Error('render failed')
    let failPosthog: () => void = () => {}
    const loading = posthog.load(() => new Promise((_, reject) => { failPosthog = () => reject(new Error('blocked')) }))
    sentry.run((active) => captureErrorWith(active, error, { alert: 'generation_failed' }))
    await sentry.load(async () => sdk)
    expect(captureException).toHaveBeenCalledWith(error)
    expect(scope.setTag).toHaveBeenCalledWith('alert', 'generation_failed')
    failPosthog()
    await loading
    const job = vi.fn()
    posthog.run(job)
    expect(job).not.toHaveBeenCalled()
  })
})
