import { getTranslations } from 'next-intl/server'
import { loginPath } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { Link } from '@/core/i18n/ui'

export const applyPath = (parent: string) => '/partners/apply' + (parent ? '?by=' + parent : '')

// The program page's way in: straight to the application when signed in, otherwise the
// account comes first (an application always belongs to a Shotviva account).
export async function ApplicationEntry({ signedIn, parent }: { signedIn: boolean; parent: string }) {
  const t = await getTranslations('affiliate')
  if (signedIn) {
    return (
      <div className="af-cta">
        <Link href={applyPath(parent)} className="af-button">{t('apply')}</Link>
      </div>
    )
  }
  const next = await localized(applyPath(parent))
  const memberLogin = loginPath(await localized('/partners'))
  return (
    <div className="af-cta">
      <Link href={'/signup?next=' + encodeURIComponent(next)} className="af-button">{t('signupToApply')}</Link>
      <p className="af-cta-note">
        {t('haveAccount')} <Link href={loginPath(next)} className="af-link">{t('loginToApply')}</Link>
        <span aria-hidden> · </span>
        <Link href={memberLogin} className="af-link">{t('memberLogin')}</Link>
      </p>
    </div>
  )
}
