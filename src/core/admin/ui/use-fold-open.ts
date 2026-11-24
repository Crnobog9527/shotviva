'use client'

import { useSyncExternalStore } from 'react'

// Whether an admin panel is expanded, remembered per browser (so per admin) under its own key.
// Closed by default, so long panels stay out of the way (Owner 2026-11-25). Storage can be
// missing or throw (private mode): an in-memory copy keeps this tab working. The server and
// hydration see closed.
const PREFIX = 'shotviva:admin:fold:'
const listeners = new Set<() => void>()
const memory = new Map<string, boolean>()

function subscribe(notify: () => void) {
  listeners.add(notify)
  window.addEventListener('storage', notify)
  return () => {
    listeners.delete(notify)
    window.removeEventListener('storage', notify)
  }
}

export function readFold(key: string): boolean {
  try {
    const stored = window.localStorage.getItem(PREFIX + key)
    return stored === null ? memory.get(key) ?? false : stored === '1'
  } catch {
    return memory.get(key) ?? false
  }
}

export function writeFold(key: string, open: boolean) {
  memory.set(key, open)
  try {
    window.localStorage.setItem(PREFIX + key, open ? '1' : '0')
  } catch {
    // Not kept across visits; the in-memory copy still serves this tab.
  }
  listeners.forEach((notify) => notify())
}

const closedOnServer = () => false

export function useFoldOpen(key: string): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(subscribe, () => readFold(key), closedOnServer)
  return [open, (next) => writeFold(key, next)]
}
