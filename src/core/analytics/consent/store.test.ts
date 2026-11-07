import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CONSENT_KEY } from './decision'
import { chooseConsent, closeConsentSettings, consentSnapshot, onConsentChange, openConsentSettings, readConsent, resetConsentForTest } from './store'

function browser(cookie: string, stored: Record<string, string> = {}, { blocked = false } = {}) {
  const data = { ...stored }
  const localStorage = {
    getItem: (key: string) => {
      if (blocked) throw new Error('SecurityError')
      return data[key] ?? null
    },
    setItem: (key: string, value: string) => {
      if (blocked) throw new Error('SecurityError')
      data[key] = value
    },
  }
  vi.stubGlobal('document', { cookie })
  vi.stubGlobal('window', { localStorage })
  return data
}

beforeEach(() => resetConsentForTest())
afterEach(() => vi.unstubAllGlobals())

describe('consent store (T70)', () => {
  it('reads the region from the proxy cookie and the answer from localStorage', () => {
    browser('NEXT_LOCALE=en; sv_analytics_region=open')
    expect(readConsent()).toEqual({ regionOpen: true, choice: null })
    expect(consentSnapshot().mode).toBe('hidden')
  })

  it('asks a European visitor who has not answered', () => {
    browser('NEXT_LOCALE=en')
    expect(consentSnapshot().mode).toBe('ask')
  })

  it('keeps the answer, hides the bar and tells PostHog at once', () => {
    const stored = browser('')
    const applied = vi.fn()
    onConsentChange(applied)
    chooseConsent('accepted')
    expect(stored[CONSENT_KEY]).toBe('accepted')
    expect(applied).toHaveBeenCalledWith({ regionOpen: false, choice: 'accepted' })
    expect(consentSnapshot().mode).toBe('hidden')
  })

  it('does not ask again after "Necessary only"', () => {
    browser('', { [CONSENT_KEY]: 'necessary' })
    expect(consentSnapshot()).toEqual({ consent: { regionOpen: false, choice: 'necessary' }, mode: 'hidden' })
  })

  it('Cookie settings reopens the bar for anyone; closing keeps the answer', () => {
    browser('sv_analytics_region=open', { [CONSENT_KEY]: 'accepted' })
    openConsentSettings()
    expect(consentSnapshot().mode).toBe('settings')
    closeConsentSettings()
    expect(consentSnapshot()).toEqual({ consent: { regionOpen: true, choice: 'accepted' }, mode: 'hidden' })
  })

  it('with storage blocked the answer still applies to this page', () => {
    browser('', {}, { blocked: true })
    expect(readConsent().choice).toBeNull()
    chooseConsent('necessary')
    expect(readConsent().choice).toBe('necessary')
  })
})
