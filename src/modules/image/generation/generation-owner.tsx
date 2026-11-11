'use client'

import { useLayoutEffect } from 'react'

import { claimStore } from './job-store'

// Rendered by the app layout with the session user's id, so this tab's generation store only
// ever shows that account's jobs (job-store claimStore). A layout effect, before the first paint.
export function GenerationOwner({ userId }: { userId: string }) {
  useLayoutEffect(() => claimStore(userId), [userId])
  return null
}
