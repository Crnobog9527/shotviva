'use client'

import { useEffect, useSyncExternalStore } from 'react'

// What keeps the new-version banner back (T90): a photo uploading, a generation running, the
// paywall or a checkout under way. 'photos' holds nothing back; it only adds the line saying a
// refresh drops the photos picked but not generated yet (they live in memory only).
export type HoldKind = 'upload' | 'generate' | 'checkout' | 'photos'

export type Holds = { busy: boolean; photos: boolean }

// Module-level, so any component (core or a module) can hold the banner without a provider.
// One token per mounted hold: two uploads at once release independently.
const active = new Map<symbol, HoldKind>()
const listeners = new Set<() => void>()
const IDLE: Holds = { busy: false, photos: false }
let snapshot: Holds = IDLE

function changed() {
  const kinds = [...active.values()]
  const next = { busy: kinds.some((kind) => kind !== 'photos'), photos: kinds.includes('photos') }
  if (next.busy === snapshot.busy && next.photos === snapshot.photos) return
  snapshot = next
  listeners.forEach((listener) => listener())
}

export function addHold(kind: HoldKind): () => void {
  const token = Symbol(kind)
  active.set(token, kind)
  changed()
  return () => {
    active.delete(token)
    changed()
  }
}

export function getHolds(): Holds {
  return snapshot
}

export function subscribeHolds(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const serverHolds = () => IDLE

export function useHolds(): Holds {
  return useSyncExternalStore(subscribeHolds, getHolds, serverHolds)
}

// Holds the banner back while `when` is true, released on unmount (a page left mid-upload).
export function useUpdateHold(kind: HoldKind, when: boolean): void {
  useEffect(() => (when ? addHold(kind) : undefined), [kind, when])
}
