'use client'

import { useEffect } from 'react'

import { CACHE_PREFIX, SERVICE_WORKER_ENABLED } from './sw'

// Registers /sw.js once the page has loaded and gone idle, so it never competes with the page's own
// first load. `production`: a production build (the root layout says, core/offline/server.ts); `next
// dev` never registers. With the kill switch off it unregisters any worker instead.
export function ServiceWorkerSlot({ production }: { production: boolean }) {
  useEffect(() => {
    if (!production || !('serviceWorker' in navigator)) return
    const container = navigator.serviceWorker
    if (!SERVICE_WORKER_ENABLED) {
      void container.getRegistrations().then((all) => Promise.all(all.map((registration) => registration.unregister())))
      return
    }
    const register = () => void container.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => undefined)
    const idle = () => ('requestIdleCallback' in window ? window.requestIdleCallback(register, { timeout: 5000 }) : globalThis.setTimeout(register, 2000))
    if (document.readyState === 'complete') idle()
    else window.addEventListener('load', idle, { once: true })
  }, [production])
  return null
}

// Sign-out: drop every cache the worker made (they hold public files only, but nothing of the
// session should outlive it). Never throws and never delays the sign-out itself.
export function clearOfflineCaches(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage('sv-clear')
    if (typeof caches !== 'undefined') {
      void caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)))).catch(() => undefined)
    }
  } catch {
    // Nothing to clear.
  }
}
