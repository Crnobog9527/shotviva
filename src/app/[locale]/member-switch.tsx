'use client'

import type { ReactNode } from 'react'

import { useSessionHint } from '@/core/auth/session-hint'

// One of two server-rendered pieces, picked in the browser by the session cookie's presence.
export function MemberSwitch({ guest, member }: { guest: ReactNode; member: ReactNode }) {
  return useSessionHint() ? member : guest
}
