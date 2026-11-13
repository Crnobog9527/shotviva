'use client'

import { useLocale } from 'next-intl'
import { useEffect, useState } from 'react'

import { track } from '@/core/analytics/browser'
import { referrerHostOf } from '@/core/analytics/share-link'
import type { FormAction } from '@/core/auth/ui'
import { localizePath } from '@/core/i18n'
import type { Locale } from '@/core/i18n/locales'
import { Link } from '@/core/i18n/ui'

import { SignupSheet } from '../home/signup-sheet'
import { rememberShare } from './share-attribution'

export type ShareCtaText = { make: string; browse: string; signUp: string; signUpNote: string; look: string }

type Props = {
  templateId: string
  shareId: string | null
  // null: signed out (or not known yet while the page streams; then no open event is sent).
  signedIn: boolean | null
  googleAction: FormAction
  // "3 free Standard images", as on the home page.
  gift: string
  text: ShareCtaText
}

// The share page's one action. Signed in: straight to the template's workspace. Signed out: the
// home page's sign-up sheet, which comes back to that same workspace once signed up or in (the
// photo is the next step there; nothing is charged before it). Records the open, once.
export function ShareCta({ templateId, shareId, signedIn, googleAction, gift, text }: Props) {
  const locale = useLocale() as Locale
  const [signUp, setSignUp] = useState(false)
  const workspace = `/generate/${encodeURIComponent(templateId)}`
  useShareOpen(templateId, shareId, signedIn)
  if (signedIn) {
    return (
      <>
        <Link href={workspace} prefetch={false} className="mk-cta">
          {text.make}
        </Link>
        <Link href="/generate" prefetch={false} className="justify-self-start text-caption font-medium text-foreground underline underline-offset-4">
          {text.browse}
        </Link>
      </>
    )
  }
  const open = () => {
    track('template_share_signup_start', { template_id: templateId, share_id: shareId })
    setSignUp(true)
  }
  return (
    <>
      <button type="button" onClick={open} className="mk-cta">
        {text.signUp}
      </button>
      <p className="text-caption text-muted-foreground">{text.signUpNote}</p>
      <Link href="/" prefetch={false} className="justify-self-start text-caption font-medium text-foreground underline underline-offset-4">
        {text.look}
      </Link>
      <SignupSheet open={signUp} onOpenChange={setSignUp} googleAction={googleAction} next={localizePath(workspace, locale)} gift={gift} />
    </>
  )
}

// template_share_open once the visitor is known, and the sv_share mark for the sign-up and the
// first photo (share-attribution.ts). Our own pages as the referrer count as none.
function useShareOpen(templateId: string, shareId: string | null, signedIn: boolean | null) {
  useEffect(() => {
    if (signedIn === null) return
    rememberShare({ templateId, shareId })
    track('template_share_open', { template_id: templateId, share_id: shareId, signed_in: signedIn, referrer_host: referrerHostOf(document.referrer, location.hostname) })
  }, [templateId, shareId, signedIn])
}
