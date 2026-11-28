'use client'

import dynamic from 'next/dynamic'
import { useLocale } from 'next-intl'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { useSessionHint } from '@/core/auth/session-hint'
import { HomeGenerator, type HomeGeneratorProps } from '@/modules/image/marketing'

import type { HomeMember } from '../../home-member'

type Base = Omit<HomeGeneratorProps, 'viewer' | 'settled'>

// The paywall and the member's generator, fetched only for a signed-in visitor.
const MemberGenerator = dynamic(() => import('./home-member-generator').then((m) => m.HomeMemberGenerator), { ssr: false })

const never = () => () => undefined
// False in the static HTML and while hydrating, true from the first render after it.
const useHydrated = () => useSyncExternalStore(never, () => true, () => false)

// Who the generator is for, worked out in the browser. Until then it is the signed-out generator,
// not settled, so a ?panel= in the address waits for the one that stays (use-template-panel.ts):
// for a visitor with no session cookie that is the same generator a moment later, with nothing
// remounted; for a signed-in one it is the member's generator, which replaces it. A refused or
// failed read (a lapsed cookie, an outage) settles as signed out: the home page is everyone's
// first page and never shows an error for this.
export function HomeViewerGate(props: Base) {
  const locale = useLocale()
  const hydrated = useHydrated()
  const signedIn = useSessionHint()
  // null: not answered yet; 'none': refused or failed.
  const [member, setMember] = useState<HomeMember | 'none' | null>(null)
  useEffect(() => {
    if (!signedIn) return
    const controller = new AbortController()
    fetch(`/api/home/viewer?locale=${locale}`, { signal: controller.signal, cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<HomeMember>) : null))
      .then((answer) => setMember(answer?.viewer ? answer : 'none'))
      .catch(() => controller.signal.aborted || setMember('none'))
    return () => controller.abort()
  }, [signedIn, locale])
  if (member && member !== 'none') return <MemberGenerator {...props} member={member} />
  return <HomeGenerator {...props} viewer={null} settled={hydrated && (!signedIn || member === 'none')} />
}
