'use client'

import { useLocale } from 'next-intl'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { track } from '@/core/analytics/browser'
import { COLLECTION_COOKIE, COLLECTION_COOKIE_MAX_AGE } from '@/core/analytics/collection-link'
import { referrerHostOf } from '@/core/analytics/share-link'

import type { FormAction } from '@/core/auth/ui'
import { localizePath } from '@/core/i18n'
import type { Locale } from '@/core/i18n/locales'

import { SignupSheet } from '../home/signup-sheet'

// Who is looking at a collection page (ARCHITECTURE §5.1g): null until the session streams in.
// Signed out, a template's "Use" opens the home page's sign-up sheet, which comes back to that
// template's workspace; signed in (or not known yet) it is a plain link there, which the proxy
// sends to sign-in when needed. One sheet for the whole page.
type Viewer = { signedIn: boolean | null; setSignedIn(value: boolean): void; signUpFor(templateId: string): void }

const ViewerContext = createContext<Viewer>({ signedIn: null, setSignedIn: () => undefined, signUpFor: () => undefined })

export const useCollectionViewer = () => useContext(ViewerContext)

// `collection`: the link id and how many picks are still live, for the funnel events.
type Props = { collection: { id: string; entries: number }; googleAction: FormAction; gift: string; children: ReactNode }

export function CollectionViewer({ collection, googleAction, gift, children }: Props) {
  const locale = useLocale() as Locale
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  useCollectionOpen(collection, signedIn)
  const signUpFor = useCallback((templateId: string) => {
    track('template_collection_signup_start', { collection_id: collection.id, template_id: templateId })
    setTarget(templateId)
  }, [collection.id])
  const value = useMemo(() => ({ signedIn, setSignedIn, signUpFor }), [signedIn, signUpFor])
  const next = localizePath(`/generate/${encodeURIComponent(target ?? '')}`, locale)
  return (
    <ViewerContext.Provider value={value}>
      {children}
      <SignupSheet open={target !== null} onOpenChange={(open) => { if (!open) setTarget(null) }} googleAction={googleAction} next={next} gift={gift} />
    </ViewerContext.Provider>
  )
}

// Rendered inside the page's Suspense once the session is read; draws nothing.
export function CollectionViewerStatus({ signedIn }: { signedIn: boolean }) {
  const { setSignedIn } = useCollectionViewer()
  useEffect(() => setSignedIn(signedIn), [signedIn, setSignedIn])
  return null
}

// template_collection_open once the visitor is known (never for the streaming placeholder), and
// the sv_tshare mark the sign-up event reads (core/analytics/collection-link.ts). Our own pages
// as the referrer count as none.
function useCollectionOpen(collection: { id: string; entries: number }, signedIn: boolean | null) {
  const sent = useRef(false)
  useEffect(() => {
    if (signedIn === null || sent.current) return
    sent.current = true
    document.cookie = `${COLLECTION_COOKIE}=${collection.id}; Path=/; Max-Age=${COLLECTION_COOKIE_MAX_AGE}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
    track('template_collection_open', {
      collection_id: collection.id, entries: collection.entries, signed_in: signedIn, referrer_host: referrerHostOf(document.referrer, location.hostname),
    })
  }, [collection.id, collection.entries, signedIn])
}
