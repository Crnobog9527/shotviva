'use client'

import { useSyncExternalStore } from 'react'

import { SECTION_IDS, type SectionId } from './layout-copy'

// Which editor sections are open, remembered per browser (so per admin) in localStorage. Storage
// can be missing or throw (private mode, blocked site data): an in-memory copy keeps this tab
// working. The server and hydration see the defaults.
const KEY = 'shotviva:admin:template-editor:sections'
const DEFAULT_OPEN: readonly SectionId[] = ['basic', 'category', 'covers', 'prompt', 'pricing']
const listeners = new Set<() => void>()
let memory: string | null = null

function subscribe(notify: () => void) {
  listeners.add(notify)
  window.addEventListener('storage', notify)
  return () => {
    listeners.delete(notify)
    window.removeEventListener('storage', notify)
  }
}

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY) ?? memory
  } catch {
    return memory
  }
}

export function parseOpen(raw: string | null): Set<SectionId> {
  if (raw === null) return new Set(DEFAULT_OPEN)
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set(DEFAULT_OPEN)
    return new Set(SECTION_IDS.filter(id => parsed.includes(id)))
  } catch {
    return new Set(DEFAULT_OPEN)
  }
}

function write(open: Iterable<SectionId>) {
  const raw = JSON.stringify(SECTION_IDS.filter(id => new Set(open).has(id)))
  memory = raw
  try {
    window.localStorage.setItem(KEY, raw)
  } catch {
    // Not kept across visits; the in-memory copy still serves this tab.
  }
  listeners.forEach(notify => notify())
}

const serverNull = () => null

export type OpenSections = { open: ReadonlySet<SectionId>; set: (id: SectionId, on: boolean) => void; setAll: (on: boolean) => void }

export function useOpenSections(): OpenSections {
  const open = parseOpen(useSyncExternalStore(subscribe, read, serverNull))
  return {
    open,
    set: (id, on) => write(on ? [...open, id] : [...open].filter(other => other !== id)),
    setAll: on => write(on ? SECTION_IDS : []),
  }
}
