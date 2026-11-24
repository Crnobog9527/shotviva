'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import type { CreateContext } from '@/modules/image/create-page'
import { DeviceCatalogue, FavoritesProvider } from '@/modules/image/create-page'

// Never settles: the shell has no account, so the dialogs and saved marks stay at their placeholders.
const never = new Promise<never>(() => undefined)
const noEntitled = Promise.resolve(null)

export function ShellCatalogue() {
  return (
    <FavoritesProvider initialIds={never as Promise<string[]>} signedIn>
      <DeviceCatalogue create={never as Promise<CreateContext>} entitled={noEntitled} />
    </FavoritesProvider>
  )
}

declare global {
  interface Window { __svShell?: { href: string; at: number; resumedAt?: number; hrefAtResume?: string } }
}

// On the real address (the worker answered /generate with this shell): ask the server for that
// address's page, so it renders the signed-in page (or sends a signed-out visitor to sign-in). The
// router already holds the visitor's address with the shell's tree, so router.replace to it is a
// no-op (probe, 2026-11-24); refresh() fetches the current address's tree from the root, layouts
// included. Opened directly at /app-shell/generate it stays put.
export function ShellResume() {
  const router = useRouter()
  useEffect(() => {
    const opened = window.__svShell?.href
    if (!opened) return
    const url = new URL(opened)
    if (url.pathname.includes('/app-shell/')) return
    window.__svShell = { ...window.__svShell!, resumedAt: performance.now(), hrefAtResume: location.href }
    router.refresh()
  }, [router])
  return null
}
