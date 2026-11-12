'use client'

import { useTranslations } from 'next-intl'

// Google sign-in (accounts.google.com) does not load on networks in mainland China, so there the
// button leads nowhere. It stays (visitors on a VPN use it); this line under it points to the
// phone and email sign-in instead. Whether to show it is the server's call (google-note.ts in the
// sign-in routes), so it is in the first HTML and never shifts the form.
export function GoogleMainlandNote({ show }: { show: boolean }) {
  const t = useTranslations('auth')
  return show ? <p className="au-hint au-gnote">{t('googleMainland')}</p> : null
}
