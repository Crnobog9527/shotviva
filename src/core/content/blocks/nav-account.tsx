import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'

// The right end of the marketing top bar (DESIGN §6.9 item 4). Signed out: Log in · Start free
// (phones: Log in only). Signed in: the one primary "Open app" → /generate and an account icon →
// /account, on every width, so a signed-in visitor never thinks the session dropped. It carries
// no user data: only whether someone is signed in.
export function NavAccount({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations('marketing.nav')
  if (!signedIn) {
    return (
      <>
        <Link href="/login" className="mk-ghost-pill mk-login">
          {t('login')}
        </Link>
        <Link href="/signup" className="mk-start">
          {t('startFree')}
        </Link>
      </>
    )
  }
  return (
    <>
      <Link href="/generate" className="mk-open">
        {t('openApp')}
      </Link>
      <Link href="/account" className="mk-acct" aria-label={t('account')} title={t('account')}>
        <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <circle cx="12" cy="8.5" r="3.8" />
          <path d="M4.5 20c1.2-3.6 4-5.3 7.5-5.3s6.3 1.7 7.5 5.3" />
        </svg>
      </Link>
    </>
  )
}
