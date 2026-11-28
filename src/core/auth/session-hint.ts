'use client'

import { useSyncExternalStore } from 'react'

import { publicEnv } from '../public-env'

// "Probably signed in", read in the browser from the session cookie's presence alone, for public
// pages that only decorate themselves for a member (the top bar's Open app, the plans a member
// already holds). Asking the server made every public page wait for a function in sfo1 before it
// could hydrate: about 1 s behind the static HTML, more on a cold instance (2026-11-28). The
// cookie is not verified here and may have lapsed: nothing is granted by this answer, and every
// page and route it leads to checks the session itself.
//
// The name is auth-js's default storage key, as @supabase/ssr writes it (core/auth/cookie-token.ts
// sessionCookieName, kept in step by session-hint.test.ts); a long session is split into `.0`, `.1`.
export function sessionCookieNameOf(supabaseUrl: string): string {
  try {
    return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
  } catch {
    return ''
  }
}

export function hasSessionCookie(cookie: string, name: string): boolean {
  if (!name) return false
  return cookie.split(';').some((part) => {
    const key = part.trim().split('=')[0]
    return key === name || key.startsWith(`${name}.`)
  })
}

const NAME = sessionCookieNameOf(publicEnv.NEXT_PUBLIC_SUPABASE_URL)
const never = () => () => undefined
const read = () => {
  try {
    return hasSessionCookie(document.cookie, NAME)
  } catch {
    return false
  }
}

// False on the server and while hydrating (the static HTML is the signed-out page), then the
// browser's answer.
export function useSessionHint(): boolean {
  return useSyncExternalStore(never, read, () => false)
}
