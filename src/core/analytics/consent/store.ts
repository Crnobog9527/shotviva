import { barWanted, CONSENT_KEY, parseChoice, type Consent, type ConsentChoice } from './decision'
import { REGION_COOKIE, REGION_OPEN } from './region'

// Browser-side consent state (T70): the region cookie the proxy set, the answer kept in
// localStorage, and whether the footer's Cookie settings reopened the bar. Storage can throw
// (Safari private mode, blocked site data); then the visitor is simply asked again.

export type BarMode = 'hidden' | 'ask' | 'settings'
type Snapshot = { consent: Consent; mode: BarMode }

const listeners = new Set<() => void>()
const changeHandlers = new Set<(consent: Consent) => void>()
let snapshot: Snapshot | null = null
let reopened = false

function readRegionOpen(cookie: string): boolean {
  return cookie.split(/;\s*/).includes(`${REGION_COOKIE}=${REGION_OPEN}`)
}

function readChoice(): ConsentChoice | null {
  try {
    return parseChoice(window.localStorage.getItem(CONSENT_KEY))
  } catch {
    return null
  }
}

const modeOf = (consent: Consent): BarMode => (reopened ? 'settings' : barWanted(consent) ? 'ask' : 'hidden')

function publish(consent: Consent): void {
  snapshot = { consent, mode: modeOf(consent) }
  for (const listener of listeners) listener()
}

export function readConsent(): Consent {
  snapshot ??= (() => {
    const consent = { regionOpen: readRegionOpen(document.cookie), choice: readChoice() }
    return { consent, mode: modeOf(consent) }
  })()
  return snapshot.consent
}

// For useSyncExternalStore: the same object until something changes.
export function consentSnapshot(): Snapshot {
  readConsent()
  return snapshot as Snapshot
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// The analytics client applies every change to PostHog (browser/client.ts), live, no reload.
export function onConsentChange(handler: (consent: Consent) => void): () => void {
  changeHandlers.add(handler)
  return () => changeHandlers.delete(handler)
}

export function chooseConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, choice)
  } catch {
    // Not remembered; it still applies to this page.
  }
  reopened = false
  const consent = { ...readConsent(), choice }
  publish(consent)
  for (const handler of changeHandlers) handler(consent)
}

export function openConsentSettings(): void {
  reopened = true
  publish(readConsent())
}

// Closing the reopened bar without answering keeps the earlier answer.
export function closeConsentSettings(): void {
  reopened = false
  publish(readConsent())
}

// Tests only.
export function resetConsentForTest(): void {
  snapshot = null
  reopened = false
  listeners.clear()
  changeHandlers.clear()
}
