import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getSessionUser, loginPath } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { Link } from '@/core/i18n/ui'
import { isAffiliateEnabled } from '../feature'
import { ApplicationDialog } from './application-dialog'
import { ApplicationForm } from './forms'
import { slugSchema, type Account, type SearchParams } from './models'
import { canApply, readAccount, readSettings } from './repository'

export async function EnrollmentScreen({ search, openForm = false }: { search: Promise<SearchParams>; openForm?: boolean }) {
  await connection()
  if (!(await isAffiliateEnabled())) notFound()
  const [session, raw] = await Promise.all([getSessionUser(), search])
  const user = session?.verified ? session : null
  const account = user ? await readAccount(user.id) : null
  if (account?.status === 'active') redirect(await localized('/partners'))
  if (account) return applicationStatus(account)
  return <Intro userId={user?.id} parent={slugSchema.catch('').parse(raw.by)} openForm={openForm} />
}

async function applicationStatus(account: Account) {
  const t = await getTranslations('affiliate')
  return (
    <section className="af-intro" role="status">
      <h1>{account.status === 'pending' ? t('pendingApplication') : t('status.' + account.status)}</h1>
      {account.status === 'pending' && <p>{t('pendingReview')}</p>}
      {account.status === 'rejected' && account.reject_reason && <p>{account.reject_reason}</p>}
    </section>
  )
}

async function Intro({ userId, parent, openForm }: { userId?: string; parent: string; openForm: boolean }) {
  const applyPath = '/partners/apply' + (parent ? '?by=' + parent : '')
  const [t, settings, eligible, returnPath] = await Promise.all([
    getTranslations('affiliate'),
    readSettings(),
    userId ? canApply(userId) : true,
    localized(applyPath),
  ])
  const applicationLogin = userId ? undefined : await localized(loginPath(returnPath))
  const memberLogin = loginPath(parent ? returnPath : await localized('/partners'))
  return (
    <section className="af-intro">
      <h1>{t('programName')}</h1>
      <h2>{t('whatTitle')}</h2>
      <p>{t('intro')}</p>
      <div className="af-entry-actions">
        <ApplicationDialog initiallyOpen={openForm} title={t('apply')} description={t('formIntro')}>
          <ApplicationForm settings={settings} eligible={eligible} parent={parent} loginUrl={applicationLogin} />
        </ApplicationDialog>
        {!userId && <Link href={memberLogin} className="af-link">{t('memberLogin')}</Link>}
      </div>
      <h2>{t('benefitsTitle')}</h2>
      <p>{t('benefits')}</p>
      <Link href="/partners/terms" className="af-link">{t('terms')}</Link>
    </section>
  )
}
