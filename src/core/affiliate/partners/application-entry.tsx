import { getTranslations } from 'next-intl/server'
import { loginPath } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { Link } from '@/core/i18n/ui'
import { ApplicationDialog } from './application-dialog'
import { ApplicationForm } from './application-form'
import type { Settings } from './models'
import { canApply } from './repository'

export async function ApplicationEntry({ userId, parent, openForm, settings }: {
  userId?: string; parent: string; openForm: boolean; settings: Settings
}) {
  const applyPath = '/partners/apply' + (parent ? '?by=' + parent : '')
  const [t, eligible, returnPath] = await Promise.all([
    getTranslations('affiliate'),
    userId ? canApply(userId) : true,
    localized(applyPath),
  ])
  const applicationLogin = userId ? undefined : await localized(loginPath(returnPath))
  const memberLogin = loginPath(await localized('/partners'))
  return (
    <div className="af-entry-actions">
      <ApplicationDialog initiallyOpen={openForm} title={t('apply')} description={t('formIntro')}>
        <ApplicationForm settings={settings} eligible={eligible} parent={parent} loginUrl={applicationLogin} />
      </ApplicationDialog>
      {!userId && <Link href={memberLogin} className="af-link">{t('memberLogin')}</Link>}
    </div>
  )
}
