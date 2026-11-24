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

// On the real address (the worker answered /generate with this shell): go to that address, so the
// server renders the signed-in page (or sends a signed-out visitor to sign-in). Opened directly at
// /app-shell/generate it stays put.
export function ShellResume() {
  const router = useRouter()
  useEffect(() => {
    const opened = window.__svShell?.href
    if (!opened) return
    const url = new URL(opened)
    if (url.pathname.includes('/app-shell/')) return
    window.__svShell = { ...window.__svShell!, resumedAt: performance.now(), hrefAtResume: location.href }
    router.replace(url.pathname + url.search + url.hash, { scroll: false })
  }, [router])
  return null
}
