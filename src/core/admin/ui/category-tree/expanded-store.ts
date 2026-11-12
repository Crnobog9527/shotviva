'use client'

import { useSyncExternalStore } from 'react'

// Which branches of a category tree are open, remembered per browser in localStorage (one key per
// tree). Storage can be missing or throw (private mode, blocked site data), so an in-memory copy
// keeps this tab working either way. The server and hydration see null: every branch collapsed.
const PREFIX = 'shotviva:admin:category-tree:'
const memory = new Map<string, string>()
const listeners = new Set<() => void>()

function subscribe(notify: () => void) {
  listeners.add(notify)
  window.addEventListener('storage', notify)
  return () => {
    listeners.delete(notify)
    window.removeEventListener('storage', notify)
  }
}

function read(name: string): string | null {
  try {
    const stored = window.localStorage.getItem(PREFIX + name)
    if (stored !== null) return stored
  } catch {
    // Fall through to the in-memory copy.
  }
  return memory.get(name) ?? null
}

export function writeExpanded(name: string, keys: Iterable<string>) {
  const raw = JSON.stringify([...new Set(keys)].sort())
  memory.set(name, raw)
  try {
    window.localStorage.setItem(PREFIX + name, raw)
  } catch {
    // Not kept across visits; the in-memory copy still serves this tab.
  }
  listeners.forEach(notify => notify())
}

const serverNull = () => null

// The raw stored string: a stable snapshot that only changes when a write does.
export function useStoredExpanded(name: string): string | null {
  return useSyncExternalStore(subscribe, () => read(name), serverNull)
}
