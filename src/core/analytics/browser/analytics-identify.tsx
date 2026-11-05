'use client'

import { useEffect } from 'react'

import { identify } from './client'

// Rendered by the signed-in layout with the session user's id; links the anonymous
// in-memory session to the person that server events (signup, generate…) already use.
export function AnalyticsIdentify({ userId }: { userId: string }) {
  useEffect(() => identify(userId), [userId])
  return null
}
