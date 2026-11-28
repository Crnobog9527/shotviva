'use client'

import { useSyncExternalStore } from 'react'

// "Probably signed in", read in the browser from the session cookie's presence alone, for public
// pages that only decorate themselves for a member (the top bar's Open app, the plans a member
// already holds). Asking the server made every public page wait for a function in sfo1 before it
// could hydrate: about 1 s behind the static HTML, more on a cold instance (2026-11-28). The
// cookie is not verified here and may have lapsed: nothing is granted by this answer, and every
// page and route it leads to checks the session itself.
//
// The cookie is auth-js's default storage key as @supabase/ssr writes it, sb-<project>-auth-token,
// split into `.0`, `.1` when long (core/auth/cookie-token.ts sessionCookieName; kept in step by
// session-hint.test.ts). Matched by shape, not by this project's name: a few bytes on every
// public page's first load matter (scripts/js-budget.json), and no other Supabase project sets
// cookies on this site.
const SESSION_COOKIE = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/

export const hasSessionCookie = (cookie: string) => SESSION_COOKIE.test(cookie)

const never = () => () => undefined

// False on the server and while hydrating (the static HTML is the signed-out page), then the
// browser's answer.
export function useSessionHint(): boolean {
  return useSyncExternalStore(never, () => hasSessionCookie(document.cookie), () => false)
}
