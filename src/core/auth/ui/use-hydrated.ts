'use client'

import { useSyncExternalStore } from 'react'

const noSubscription = () => () => undefined

// false in the server's HTML and while React hydrates it, true from the first client render after.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  )
}
