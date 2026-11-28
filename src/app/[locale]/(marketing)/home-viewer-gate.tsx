'use client'

import { useLocale } from 'next-intl'
import { useEffect, useState, useSyncExternalStore, type ComponentType } from 'react'

import { useSessionHint } from '@/core/auth/session-hint'
import { HomeGenerator, type HomeGeneratorProps } from '@/modules/image/marketing'

import type { HomeMember } from '../../home-member'

type Base = Omit<HomeGeneratorProps, 'viewer' | 'settled'>
type MemberView = ComponentType<Base & { member: HomeMember }>
// The member's data and the code that draws it, both in hand: only then does it replace the
// signed-out generator, so the first screen is never empty in between.
type Ready = { member: HomeMember; View: MemberView }

// No box of its own: the generator lays out as the section's child, as before.
const WRAP = { display: 'contents' } as const

const never = () => () => undefined
// False in the static HTML and while hydrating, true from the first render after it.
const useHydrated = () => useSyncExternalStore(never, () => true, () => false)

// The paywall and the member's generator are their own chunk, fetched only for a signed-in visitor
// and at the same time as their data, not after it.
async function loadMember(locale: string, signal: AbortSignal): Promise<Ready | null> {
  const [member, view] = await Promise.all([
    fetch(`/api/home/viewer?locale=${locale}`, { signal, cache: 'no-store' }).then((response) => (response.ok ? (response.json() as Promise<HomeMember>) : null)),
    import('./home-member-generator'),
  ])
  return member?.viewer ? { member, View: view.HomeMemberGenerator } : null
}

// Who the generator is for, worked out in the browser. Until then it is the signed-out generator,
// not settled, so a ?panel= in the address waits for the one that stays (use-template-panel.ts).
// - No session cookie: the same generator a moment later, settled; nothing remounts.
// - A session cookie: the signed-out generator stays on screen but inert until the member's one
//   replaces it, so nothing picked, typed or uploaded in that second is lost with it and Generate
//   cannot start the signed-out flow for someone who is signed in. It is not dimmed: for most
//   visits the wait is shorter than a tap.
// - A refused or failed read (a lapsed cookie, an outage): settles as signed out and unlocks. The
//   home page is everyone's first page and never shows an error for this.
export function HomeViewerGate(props: Base) {
  const locale = useLocale()
  const hydrated = useHydrated()
  const signedIn = useSessionHint()
  // null: not answered yet; 'none': refused or failed.
  const [ready, setReady] = useState<Ready | 'none' | null>(null)
  useEffect(() => {
    if (!signedIn) return
    const controller = new AbortController()
    loadMember(locale, controller.signal).then(
      (answer) => setReady(answer ?? 'none'),
      () => controller.signal.aborted || setReady('none'),
    )
    return () => controller.abort()
  }, [signedIn, locale])
  if (ready && ready !== 'none') return <ready.View {...props} member={ready.member} />
  const waiting = signedIn && ready === null
  return (
    <div style={WRAP} inert={waiting} aria-busy={waiting || undefined}>
      <HomeGenerator {...props} viewer={null} settled={hydrated && !waiting} />
    </div>
  )
}
