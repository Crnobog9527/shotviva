'use client'

import type { ReactNode } from 'react'

import { clearOfflineCaches } from '../../offline'

// Sign out: the service worker's caches go too (core/offline; they hold public files only, but
// nothing of the session should outlive it). The sign-out itself is the server action, unchanged.
export function SignOutForm({ action, children }: { action: () => Promise<void>; children: ReactNode }) {
  return (
    <form action={action} onSubmit={clearOfflineCaches}>
      {children}
    </form>
  )
}
