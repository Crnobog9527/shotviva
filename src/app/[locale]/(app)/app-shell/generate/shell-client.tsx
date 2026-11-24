'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { CreateContext } from '@/modules/image/create-page'
import { DeviceCatalogue, FavoritesProvider } from '@/modules/image/create-page'

import { replayTap, shellTapKey } from './shell-taps'

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
  interface Window { __svShell?: { href: string; refreshed?: boolean; tap?: { key: string; at: number } } }
}

// The worker answered the visitor's address (/generate, /zh/generate) with this shell when the
// address read before hydration is not the shell's own.
function answeredByWorker(): boolean {
  const opened = window.__svShell?.href
  return Boolean(opened) && !new URL(opened as string).pathname.includes('/app-shell/')
}

// Once hydrated on the real address: ask the server for that address's page from the root
// (router.refresh(); router.replace to the address the router already holds does nothing, probe
// 2026-11-24). The server renders the signed-in page, or sends a signed-out visitor to sign-in.
// Until then a tap on the shell does nothing visible: it is caught before anything sees it; the last
// open action on the whitelist is replayed on the real page within 10 s, anything else is dropped
// (shell-taps.ts). No panel opens on the shell. When the real page takes over, Next keeps this route hidden (Activity) and runs this
// effect's cleanup: the shell then renders nothing, so no second catalogue, duplicate id or hidden
// copy stays on the page. Opened at /app-shell/generate itself, it stays put and inert.
export function ShellFrame({ children }: { children: ReactNode }) {
  const router = useRouter()
  const frame = useRef<HTMLDivElement>(null)
  const [retired, setRetired] = useState(false)
  useEffect(() => {
    const element = frame.current
    const hold = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      const key = shellTapKey(event.target)
      if (key && window.__svShell) window.__svShell.tap = { key, at: Date.now() }
    }
    element?.addEventListener('click', hold, true)
    if (answeredByWorker() && window.__svShell && !window.__svShell.refreshed) {
      window.__svShell.refreshed = true
      router.refresh()
    }
    return () => {
      element?.removeEventListener('click', hold, true)
      if (!window.__svShell?.refreshed) return
      setRetired(true)
      const tap = window.__svShell.tap
      window.__svShell.tap = undefined
      if (tap) window.requestAnimationFrame(() => replayTap(tap, Date.now()))
    }
  }, [router])
  if (retired) return null
  return <div ref={frame} data-app-shell="">{children}</div>
}
