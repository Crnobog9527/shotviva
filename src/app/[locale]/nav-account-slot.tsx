import { unstable_rethrow } from 'next/navigation'
import { Suspense } from 'react'

import { getSessionUser } from '@/core/auth'
import { NavAccount } from '@/core/content'
import { logger } from '@/core/logger'

// Request-time: is someone signed in? Only this small hole reads the session, so the marketing
// pages stay statically cached with the signed-out bar as the fallback (DESIGN §6.9 item 4).
// An unverified account is treated as signed out (the app would send it back to log in).
async function signedIn(): Promise<boolean> {
  try {
    return (await getSessionUser())?.emailVerified === true
  } catch (error) {
    unstable_rethrow(error)
    logger.error('nav.session_read_failed', { error })
    return false
  }
}

async function Resolved() {
  return <NavAccount signedIn={await signedIn()} />
}

export function NavAccountSlot() {
  return (
    <Suspense fallback={<NavAccount signedIn={false} />}>
      <Resolved />
    </Suspense>
  )
}
