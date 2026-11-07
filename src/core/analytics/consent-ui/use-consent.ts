'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

import { afterLoad } from '../browser/sdk'
import { consentSnapshot, subscribeConsent, type BarMode } from '../consent/store'
import type { Consent } from '../consent/decision'

// The server (and the first client render, for hydration) never shows the bar: the region
// cookie and the stored answer exist only in the browser.
const SERVER: { consent: Consent; mode: BarMode } = { consent: { regionOpen: true, choice: null }, mode: 'hidden' }

export function useConsent() {
  return useSyncExternalStore(subscribeConsent, consentSnapshot, () => SERVER)
}

// True once the page has loaded and gone idle, when PostHog itself starts (browser/sdk.ts): the
// bar never competes with the page's first paint or its LCP.
export function useAfterLoad(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => afterLoad(() => setReady(true)), [])
  return ready
}
