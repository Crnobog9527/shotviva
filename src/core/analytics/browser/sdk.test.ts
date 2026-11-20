import type { PostHog } from 'posthog-js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { captureErrorWith } from '../capture-scope'
import { loadedSdks, loadSdks, MAX_QUEUED, resetSdksForTest, withSdks, type Sdks } from './sdk'

type SentrySdk = NonNullable<Sdks['sentry']>

const fakePosthog = () => ({ capture: vi.fn() }) as unknown as PostHog & { capture: ReturnType<typeof vi.fn> }

function fakeSentry() {
  const scope = { setTag: vi.fn(), setLevel: vi.fn(), setContext: vi.fn() }
  return {
    scope,
    sdk: { withScope: (fn: (s: typeof scope) => void) => fn(scope), captureException: vi.fn(), captureMessage: vi.fn() } as unknown as SentrySdk & {
      captureException: ReturnType<typeof vi.fn>
    },
  }
}

afterEach(() => resetSdksForTest())

describe('browser SDKs after load (performance B6)', () => {
  it('holds jobs until the SDKs are in, then runs them in order', async () => {
    const posthog = fakePosthog()
    withSdks((sdks) => sdks.posthog?.capture('first'))
    withSdks((sdks) => sdks.posthog?.capture('second'))
    expect(loadedSdks()).toBeNull()
    await loadSdks({ sentry: null, posthog: async () => posthog })
    expect(posthog.capture.mock.calls.map((call) => call[0])).toEqual(['first', 'second'])
    withSdks((sdks) => sdks.posthog?.capture('later'))
    expect(posthog.capture).toHaveBeenLastCalledWith('later')
  })

  it('keeps at most MAX_QUEUED jobs before load', async () => {
    const posthog = fakePosthog()
    for (let i = 0; i < MAX_QUEUED + 10; i++) withSdks((sdks) => sdks.posthog?.capture(`e${i}`))
    await loadSdks({ sentry: null, posthog: async () => posthog })
    expect(posthog.capture).toHaveBeenCalledTimes(MAX_QUEUED)
  })

  it('a failing job does not stop the ones after it', async () => {
    const posthog = fakePosthog()
    withSdks(() => {
      throw new Error('boom')
    })
    withSdks((sdks) => sdks.posthog?.capture('after'))
    await loadSdks({ sentry: null, posthog: async () => posthog })
    expect(posthog.capture).toHaveBeenCalledWith('after')
  })

  it('an error captured before Sentry is in is sent with its alert tag once it is', async () => {
    const { sdk, scope } = fakeSentry()
    const error = new Error('render failed')
    withSdks((sdks) => sdks.sentry && captureErrorWith(sdks.sentry, error, { alert: 'generation_failed' }))
    expect(sdk.captureException).not.toHaveBeenCalled()
    await loadSdks({ sentry: async () => sdk, posthog: null })
    expect(sdk.captureException).toHaveBeenCalledWith(error)
    expect(scope.setTag).toHaveBeenCalledWith('alert', 'generation_failed')
  })
})
