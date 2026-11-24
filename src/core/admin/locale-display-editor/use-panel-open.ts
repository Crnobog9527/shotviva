'use client'

import { useSyncExternalStore } from 'react'

// Whether 分语言展示 is expanded, remembered per browser (so per admin). Closed by default so the
// rest of the templates page stays in reach (Owner 2026-11-25). Storage can be missing or throw
// (private mode): an in-memory copy keeps this tab working. The server and hydration see closed.
const KEY = 'shotviva:admin:locale-display:open'
const listeners = new Set<() => void>()
let memory = false

function subscribe(notify: () => void) {
  listeners.add(notify)
  window.addEventListener('storage', notify)
  return () => {
    listeners.delete(notify)
    window.removeEventListener('storage', notify)
  }
}

function read(): boolean {
  try {
    const stored = window.localStorage.getItem(KEY)
    return stored === null ? memory : stored === '1'
  } catch {
    return memory
  }
}

function write(open: boolean) {
  memory = open
  try {
    window.localStorage.setItem(KEY, open ? '1' : '0')
  } catch {
    // Not kept across visits; the in-memory copy still serves this tab.
  }
  listeners.forEach((notify) => notify())
}

const closedOnServer = () => false

export function usePanelOpen(): [boolean, (open: boolean) => void] {
  return [useSyncExternalStore(subscribe, read, closedOnServer), write]
}
