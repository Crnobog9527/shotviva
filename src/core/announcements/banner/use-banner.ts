'use client'

import { useSyncExternalStore } from 'react'

import { DISMISS_STORAGE_KEY, pickLive, type BannerAnnouncement } from '../rules'

const MINUTE = 60_000

// The clock in whole minutes: a stable snapshot that changes once a minute, which is as fine
// as a start or end time needs. null on the server and during hydration.
function subscribeMinute(notify: () => void) {
  const timer = setInterval(notify, MINUTE)
  return () => clearInterval(timer)
}
const currentMinute = () => Math.floor(Date.now() / MINUTE)

// Dismissal by announcement id in localStorage. The storage event only reaches other tabs, so
// this tab's own write notifies through the listener set.
const listeners = new Set<() => void>()
let memoryDismissed: string | null = null
function subscribeDismissed(notify: () => void) {
  listeners.add(notify)
  window.addEventListener('storage', notify)
  return () => {
    listeners.delete(notify)
    window.removeEventListener('storage', notify)
  }
}
function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_STORAGE_KEY)
  } catch {
    return null
  }
}
function writeDismissed(id: string) {
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, id)
  } catch {
    // Private mode: nothing to keep; the in-memory fallback below still hides it.
  }
  memoryDismissed = id
  listeners.forEach((notify) => notify())
}
const dismissedSnapshot = () => readDismissed() ?? memoryDismissed
const serverNull = () => null

// Starts from the server's pick (same HTML on both sides), then follows the real clock and the
// stored dismissal: a new announcement has a new id, so it shows again.
export function useBanner(items: readonly BannerAnnouncement[], initialId: string | null) {
  const minute = useSyncExternalStore(subscribeMinute, currentMinute, serverNull)
  const dismissed = useSyncExternalStore(subscribeDismissed, dismissedSnapshot, serverNull)
  const current = minute === null ? (items.find((item) => item.id === initialId) ?? null) : pickLive(items, minute * MINUTE)
  return { current: current && current.id !== dismissed ? current : null, dismiss: writeDismissed }
}
