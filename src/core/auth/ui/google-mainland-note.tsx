'use client'

import { useTranslations } from 'next-intl'

import { MAINLAND_ZONE_NAMES } from '../mainland-zone'

// Unhides the line just before it when the browser's time zone is a mainland one. Plain ES5, runs
// while the HTML is parsed, so the line is in the first paint.
const SHOW_IN_MAINLAND_ZONE = `(function(s){try{var z=Intl.DateTimeFormat().resolvedOptions().timeZone;if(${JSON.stringify(MAINLAND_ZONE_NAMES)}.indexOf(z)>=0)s.previousElementSibling.hidden=false}catch(e){}})(document.currentScript)`

// Google sign-in (accounts.google.com) does not load on networks in mainland China, so there the
// button leads nowhere. It stays (visitors on a VPN use it); this line under it points to the
// phone and email sign-in instead. Chinese pages always show it. English pages are static, so
// their cached HTML (the pages' Suspense fallback) carries the line hidden plus a tiny inline
// script that shows it for a mainland time zone before the first paint; the form React renders
// later (auth-screens.tsx) decides the same way. Without this the line appeared only after
// hydration, as the form's largest text, which made it the mobile LCP several seconds late for
// those visitors (/login: 3.8 s with throttling applied).
export function GoogleMainlandNote({ show }: { show: boolean | 'zone' }) {
  const t = useTranslations('auth')
  if (show === 'zone') {
    return (
      <>
        <p className="au-hint au-gnote" hidden suppressHydrationWarning>
          {t('googleMainland')}
        </p>
        <script dangerouslySetInnerHTML={{ __html: SHOW_IN_MAINLAND_ZONE }} />
      </>
    )
  }
  return show ? <p className="au-hint au-gnote">{t('googleMainland')}</p> : null
}
