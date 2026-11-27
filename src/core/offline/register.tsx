'use client'

import { useEffect } from 'react'

import { CACHE_PREFIX, withoutBypass } from './client-names'

// Registers /sw.js once the page has loaded and gone idle, so it never competes with the page's own
// first load. `production`: a production build (`next dev` never registers); `enabled`: the admin
// switch system_settings service_worker_enabled (both read by the root layout). Switched off, it
// unregisters any worker instead (the kill switch, with /sw.js itself unregistering). `shell`: the
// switch service_worker_shell_enabled; off, a Create shell still on the phone goes at once and the
// worker is asked to update, not left to the browser's own update check (Part B 2026-11-27).
export function ServiceWorkerSlot({ production, enabled, shell }: { production: boolean; enabled: boolean; shell: boolean }) {
  // Loaded past Create's app shell (shell-fallback.ts): the address bar shows the plain address
  // again, so a reload, a share or a bookmark is the normal one.
  useEffect(() => {
    try {
      const plain = withoutBypass(window.location.href)
      if (plain) window.history.replaceState(null, '', plain)
    } catch {
      // Leave the address as it is.
    }
  }, [])
  useEffect(() => {
    if (!production || !('serviceWorker' in navigator)) return
    const container = navigator.serviceWorker
    if (!enabled) {
      void container.getRegistrations().then((all) => Promise.all(all.map((registration) => registration.unregister())))
      return
    }
    if (!shell) void dropStaleShell(container)
    const register = () => void container.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => undefined)
    const idle = () => ('requestIdleCallback' in window ? window.requestIdleCallback(register, { timeout: 5000 }) : globalThis.setTimeout(register, 2000))
    if (document.readyState === 'complete') idle()
    else window.addEventListener('load', idle, { once: true })
  }, [production, enabled, shell])
  return null
}

// The shell switch is off but this phone still holds a shell: delete it and fetch the new worker.
export async function dropStaleShell(container: ServiceWorkerContainer): Promise<void> {
  try {
    const stale = (await caches.keys()).filter((key) => key.startsWith(`${CACHE_PREFIX}shell-`))
    if (!stale.length) return
    await Promise.all(stale.map((key) => caches.delete(key)))
    await (await container.getRegistration())?.update()
  } catch {
    // The worker's own activation deletes it too.
  }
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

// A newer build is out (the version check, core/app-update): the worker stops answering with an
// older build's app shell (ARCHITECTURE §18.3). `build` is this page's own. Never throws.
export function dropAppShell(build: string): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'sv-drop-shell', build })
  } catch {
    // No worker.
  }
}

// One screen's first-screen template covers (LCP plan 1; `screen` names it: All, a category): the
// worker keeps these in place of that screen's earlier set, so the next launch paints them from the
// phone. Sent to the active worker once there is one (on a first visit, after it installs); without
// a worker (switched off, unsupported) nothing happens.
export function keepFirstScreenCovers(screen: string, urls: readonly string[]): void {
  try {
    if (urls.length === 0 || !('serviceWorker' in navigator)) return
    void navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage({ type: 'sv-keep-covers', screen, urls: [...urls] })).catch(() => undefined)
  } catch {
    // Nothing to keep.
  }
}
