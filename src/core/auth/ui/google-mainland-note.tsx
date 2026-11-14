'use client'

import { useTranslations } from 'next-intl'
import { useSyncExternalStore } from 'react'

import { inMainlandZone, MAINLAND_ZONE_NAMES } from '../mainland-zone'

// Unhides the line just before it when the browser's time zone is a mainland one. Plain ES5, runs
// while the HTML is parsed, so the line is in the first paint.
const SHOW_IN_MAINLAND_ZONE = `(function(s){try{var z=Intl.DateTimeFormat().resolvedOptions().timeZone;if(${JSON.stringify(MAINLAND_ZONE_NAMES)}.indexOf(z)>=0)s.previousElementSibling.hidden=false}catch(e){}})(document.currentScript)`

const never = () => () => {}

// Google sign-in (accounts.google.com) does not load on networks in mainland China, so there the
// button leads nowhere. It stays (visitors on a VPN use it); this line under it points to the
// phone and email sign-in instead. Chinese pages always show it.
//
// English pages decide by the browser's time zone ('zone'), and the server cannot know it. So the
// server and the hydrating browser both render the line hidden with a tiny inline script after it
// that shows it while the HTML is parsed (first paint, not after hydration); the hydration pass
// uses the server's answer (hidden, which React does not re-apply), and the next render the real
// one, so a form React mounts later (client navigation, a remount) is right too. Deciding during
// render instead made the server (UTC) and a mainland browser disagree: React error #418, the form
// thrown away and drawn again after hydration, and with it a mobile LCP seconds late.
export function GoogleMainlandNote({ show }: { show: boolean | 'zone' }) {
  const t = useTranslations('auth')
  const inZone = useSyncExternalStore(never, inMainlandZone, () => false)
  if (show === 'zone') {
    return (
      <>
        <p className="au-hint au-gnote" hidden={!inZone} suppressHydrationWarning>
          {t('googleMainland')}
        </p>
        <script dangerouslySetInnerHTML={{ __html: SHOW_IN_MAINLAND_ZONE }} />
      </>
    )
  }
  return show ? <p className="au-hint au-gnote">{t('googleMainland')}</p> : null
}
