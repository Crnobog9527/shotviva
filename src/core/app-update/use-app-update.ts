'use client'

import { useEffect, useSyncExternalStore } from 'react'

import { track } from '../analytics/browser'
import { publicEnv } from '../public-env'
import { getHolds, subscribeHolds } from './holds'
import { onStaleBuild } from './stale-build'
import { createUpdateController, type UpdateController, type UpdateView } from './update-controller'

const DISMISS_KEY = 'sv-update-dismissed'

// A plain fetch on purpose. Vercel Skew Protection pins a request to an older deployment by the
// x-deployment-id header, a ?dpl= query or a __vdpl cookie; Next adds the first two only to its
// own router and Server Action requests, and nothing here sets __vdpl, so this request reaches
// whatever deployment the address now serves. Cookies stay on: preview deployments sit behind
// Vercel's deployment protection, whose cookie this needs.
async function fetchServed(): Promise<string | null> {
  const response = await fetch('/api/version', { cache: 'no-store' })
  if (!response.ok) return null
  const body: unknown = await response.json()
  const version = typeof body === 'object' && body !== null ? (body as { version?: unknown }).version : null
  return typeof version === 'string' && version.length > 0 && version.length <= 128 ? version : null
}

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY)
  } catch {
    return null
  }
}

function writeDismissed(key: string) {
  try {
    window.localStorage.setItem(DISMISS_KEY, key)
  } catch {
    // Storage blocked: the controller still remembers it for this tab.
  }
}

let controller: UpdateController | null = null

// One per tab, made on first use in the browser.
function getController(): UpdateController {
  controller ??= createUpdateController({
    current: publicEnv.NEXT_PUBLIC_APP_VERSION,
    fetchServed,
    readDismissed,
    writeDismissed,
    track: (action, reason) => track('app_update_prompt', { action, reason }),
    reload: () => window.location.reload(),
    now: () => Date.now(),
    doc: document,
    setInterval: (run, ms) => window.setInterval(run, ms),
    clearInterval: (handle) => window.clearInterval(handle as number),
  })
  return controller
}

const HIDDEN: UpdateView = { show: false }
const subscribe = (listener: () => void) => getController().subscribe(listener)
const getView = () => getController().getView()
const serverView = () => HIDDEN

// The banner's state (T90). Mounted once, by the root layout's slot.
export function useAppUpdate() {
  const view = useSyncExternalStore(subscribe, getView, serverView)
  useEffect(() => {
    const updates = getController()
    updates.setHolds(getHolds())
    const stopHolds = subscribeHolds(() => updates.setHolds(getHolds()))
    const stopErrors = onStaleBuild(() => updates.staleBuild())
    const stopChecks = updates.start()
    return () => {
      stopHolds()
      stopErrors()
      stopChecks()
    }
  }, [])
  return { view, refresh: () => getController().refresh(), dismiss: () => getController().dismiss() }
}
