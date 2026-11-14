'use client'

import { useSyncExternalStore } from 'react'

const never = () => () => {}

// Throws on the first render after hydration (the server snapshot is false, the browser's true),
// so the error reaches the nearest error boundary in the browser, as a page error would.
export function ThrowAfterMount() {
  const inBrowser = useSyncExternalStore(never, () => true, () => false)
  if (inBrowser) throw new Error('error-test: thrown on purpose')
  return null
}
