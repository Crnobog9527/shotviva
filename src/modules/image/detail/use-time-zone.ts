'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
const noZone = () => null

// The viewer's time zone, or null on the server and during hydration: the server cannot know
// it, so anything rendered from it waits for the browser instead of mismatching on hydration.
export function useTimeZone(): string | null {
  return useSyncExternalStore(subscribe, browserZone, noZone)
}
