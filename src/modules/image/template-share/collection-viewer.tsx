'use client'

import { useLocale } from 'next-intl'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

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

type Props = { googleAction: FormAction; gift: string; children: ReactNode }

export function CollectionViewer({ googleAction, gift, children }: Props) {
  const locale = useLocale() as Locale
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const signUpFor = useCallback((templateId: string) => setTarget(templateId), [])
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
