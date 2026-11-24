'use client'

import { lazy, Suspense, useEffect, useState } from 'react'

import { vitalsRouteRoot } from './route-root'

const WebVitalsReporter = lazy(() => import('./web-vitals-reporter'))

// After the load event, on idle: the reporter never competes with the page it measures.
function afterLoadIdle(start: () => void): () => void {
  let handle: number | undefined
  const idle = () => {
    handle = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(start, { timeout: 3000 }) : window.setTimeout(start, 1)
  }
  if (document.readyState === 'complete') idle()
  else window.addEventListener('load', idle, { once: true })
  return () => {
    window.removeEventListener('load', idle)
    if (handle === undefined) return
    if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(handle)
    else window.clearTimeout(handle)
  }
}

// Anonymous speed numbers for the signed-in app pages (ARCHITECTURE §16, Owner 2026-11-24:
// numbers only). Mounted once in the (app) layout; starts only when the page loaded on one of the
// allowlisted roots, so /admin, /checkout and the rest send nothing. Draws nothing.
export function WebVitalsSlot() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!vitalsRouteRoot(window.location.pathname)) return
    return afterLoadIdle(() => setOn(true))
  }, [])
  return on ? (
    <Suspense fallback={null}>
      <WebVitalsReporter />
    </Suspense>
  ) : null
}
