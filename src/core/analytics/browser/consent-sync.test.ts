import { describe, expect, it, vi } from 'vitest'

import type { Consent } from '../consent/decision'
import { clearPosthogStorage, syncPosthog } from './consent-sync'

function fakePosthog(config: { persistence: 'memory' | 'localStorage+cookie'; disable_session_recording: boolean }) {
  const posthog = {
    config: { ...config },
    set_config: vi.fn((patch: Partial<typeof config>) => Object.assign(posthog.config, patch)),
  }
  return posthog
}

const european: Consent = { regionOpen: false, choice: null }

describe('syncPosthog: the answer applies live, without a reload (T70)', () => {
  it('"Accept" moves a European visitor from memory to cookies and lets replay follow the project', () => {
    const posthog = fakePosthog({ persistence: 'memory', disable_session_recording: true })
    syncPosthog(posthog, { ...european, choice: 'accepted' }, '/pricing')
    expect(posthog.set_config).toHaveBeenCalledExactlyOnceWith({ persistence: 'localStorage+cookie', disable_session_recording: false })
  })

  it('"Necessary only" after accepting goes back to memory and holds replay off', () => {
    const posthog = fakePosthog({ persistence: 'localStorage+cookie', disable_session_recording: false })
    syncPosthog(posthog, { ...european, choice: 'necessary' }, '/pricing')
    expect(posthog.set_config).toHaveBeenCalledExactlyOnceWith({ persistence: 'memory', disable_session_recording: true })
  })

  it('does nothing when nothing changes (set_config restarts every extension)', () => {
    const posthog = fakePosthog({ persistence: 'memory', disable_session_recording: true })
    syncPosthog(posthog, { ...european, choice: 'necessary' }, '/generate')
    expect(posthog.set_config).not.toHaveBeenCalled()
  })

  it('holds replay off on the way into /checkout and lets go on the way out', () => {
    const posthog = fakePosthog({ persistence: 'localStorage+cookie', disable_session_recording: false })
    const open: Consent = { regionOpen: true, choice: null }
    syncPosthog(posthog, open, '/zh/checkout?session_id=1')
    expect(posthog.set_config).toHaveBeenLastCalledWith({ disable_session_recording: true })
    syncPosthog(posthog, open, '/photos')
    expect(posthog.set_config).toHaveBeenLastCalledWith({ disable_session_recording: false })
  })
})

// Like window.localStorage: stored keys are the own enumerable properties.
function fakeStorage(entries: Record<string, string>): Storage {
  const storage: Record<string, unknown> = { ...entries }
  Object.defineProperty(storage, 'removeItem', { value: (key: string) => delete storage[key], enumerable: false })
  return storage as unknown as Storage
}

describe('clearPosthogStorage', () => {
  it('removes PostHog cookies on the host and parent domains, and PostHog storage keys only', () => {
    const written: string[] = []
    const doc = {
      location: { hostname: 'www.shotviva.com' },
      get cookie() {
        return 'ph_phc_x_posthog=%7B%7D; NEXT_LOCALE=zh; sv_analytics_region=open'
      },
      set cookie(value: string) {
        written.push(value)
      },
    } as unknown as Document
    const local = fakeStorage({ ph_phc_x_posthog: '{}', __ph_opt_in_out_phc_x: '1', sv_analytics_consent: 'necessary' })
    clearPosthogStorage(doc, [local])
    expect(written).toEqual([
      'ph_phc_x_posthog=; Max-Age=0; Path=/',
      'ph_phc_x_posthog=; Max-Age=0; Path=/; Domain=www.shotviva.com',
      'ph_phc_x_posthog=; Max-Age=0; Path=/; Domain=shotviva.com',
    ])
    expect(Object.keys(local)).toEqual(['sv_analytics_consent'])
  })
})
