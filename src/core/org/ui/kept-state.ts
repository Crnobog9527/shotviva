'use client'

import { createContext, useCallback, useContext, useState, useSyncExternalStore } from 'react'

// State that must outlive a row: idempotency request ids and typed amounts of the member forms.
// Rows unmount when a filter hides them, the page resets or selection mode starts; a retry after a
// lost answer must still carry the same request id, so the owner of the list keeps them here,
// keyed by `userId:kind:form`. An id is replaced only by the form's own success handler, and every
// mounted form reads the store live (a form remounted while its request was in flight sees the new
// id and an empty amount once that request succeeds).
export type Kept = { values: Map<string, unknown>; listeners: Set<() => void> }

export const createKept = (): Kept => ({ values: new Map(), listeners: new Set() })

export const KeptContext = createContext<Kept | null>(null)

// The stored value for `key`, creating it from `init` the first time (pure; tested).
export function keep<T>(store: Kept, key: string, init: () => T): T {
  if (!store.values.has(key)) store.values.set(key, init())
  return store.values.get(key) as T
}

export function setKept<T>(store: Kept, key: string, next: T): void {
  store.values.set(key, next)
  for (const listener of [...store.listeners]) listener()
}

export function useKeptState<T>(key: string, init: () => T): [T, (next: T) => void] {
  const [own] = useState<Kept>(createKept)
  const store = useContext(KeptContext) ?? own
  const subscribe = useCallback((listener: () => void) => { store.listeners.add(listener); return () => { store.listeners.delete(listener) } }, [store])
  const read = () => keep(store, key, init)
  const value = useSyncExternalStore(subscribe, read, read)
  const set = useCallback((next: T) => setKept(store, key, next), [store, key])
  return [value, set]
}

export const newRequestId = () => crypto.randomUUID()
