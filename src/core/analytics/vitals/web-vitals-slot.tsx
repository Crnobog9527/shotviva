'use client'

import { useEffect } from 'react'

import { afterLoad } from '../browser/sdk'

// Everything else (route-root, the report, web-vitals) is in the lazy chunk (start-vitals.ts),
// so the app's first-load JS carries only this test, which must agree with fields.ts
// VITAL_ROUTES (web-vitals-slot.test.ts).
export const APP_ROOT_PATH = /^(\/zh)?\/(generate|photos|posters|account|wishlist)(\/|$)/

// Anonymous speed numbers for the signed-in app pages (ARCHITECTURE §16, Owner 2026-11-24:
// numbers only). Mounted once in the (app) layout; starts only when the page loaded on one of the
// allowlisted roots, so /admin, /checkout and the rest send nothing. After the load event, on
// idle (the analytics SDKs' own scheduler, already in every page), so it never competes with the
// page it measures. Importing start-vitals starts it. Draws nothing.
export function WebVitalsSlot() {
  useEffect(() => {
    if (APP_ROOT_PATH.test(location.pathname)) afterLoad(() => void import('./start-vitals').catch(() => {}))
  }, [])
  return null
}
