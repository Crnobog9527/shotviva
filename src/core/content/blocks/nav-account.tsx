import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'

const CameraIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </svg>
)

// The right end of the marketing top bar (DESIGN §6.9 item 4). Signed out: Log in · Start free
// (phones: Log in only). Signed in: the one primary "Open app" → /generate and an account icon →
// /account, on every width, so a signed-in visitor never thinks the session dropped. It carries
// no user data: only whether someone is signed in.
// Start free carries two more labels for pages with the first-screen generator, from 768px up,
// while the generator is scrolled away (modules/image use-header-upload; Owner 2026-11-08,
// replacing the floating bar there): "Upload photo" takes the visitor back with the file picker
// open, "Generate" (a photo is already in) just takes them back. All labels share one grid cell,
// so the button keeps the widest one's width and nothing moves when they swap.
export function NavAccount({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations('marketing.nav')
  if (!signedIn) {
    return (
      <>
        <Link href="/login" className="mk-ghost-pill mk-login">
          {t('login')}
        </Link>
        <Link href="/signup" className="mk-start" data-generator-upload="">
          <span className="mk-start-free">{t('startFree')}</span>
          <span className="mk-start-up">
            <CameraIcon />
            {t('uploadPhoto')}
          </span>
          <span className="mk-start-gen">{t('generate')}</span>
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
