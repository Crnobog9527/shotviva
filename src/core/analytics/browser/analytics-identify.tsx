'use client'

import { useEffect } from 'react'

import { identify } from './client'
import { STAFF_COOKIE } from './gallery'

const YEAR_SECONDS = 365 * 24 * 3600

// Rendered by the signed-in layout with the session user's id; links the anonymous
// in-memory session to the person that server events (signup, generate…) already use. `staff`
// (an admin or a QA account) marks this browser so the gallery's counts leave it out (T108); a
// normal account clears the mark.
export function AnalyticsIdentify({ userId, staff = false }: { userId: string; staff?: boolean }) {
  useEffect(() => identify(userId), [userId])
  useEffect(() => {
    document.cookie = staff
      ? `${STAFF_COOKIE}=1; path=/; max-age=${YEAR_SECONDS}; samesite=lax; secure`
      : `${STAFF_COOKIE}=; path=/; max-age=0; samesite=lax; secure`
  }, [staff])
  return null
}
