import type { ReactNode } from 'react'
import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getSessionUser, loginPath } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { Link } from '@/core/i18n/ui'
import { isAffiliateEnabled } from '../feature'
import { publishedTerms } from './terms'
import { ApplicationDialog } from './application-dialog'
import { ApplicationForm } from './forms'
import { slugSchema, type Account, type SearchParams, type Settings } from './models'
import { canApply, readAccount, readSettings } from './repository'

export async function EnrollmentScreen({ search, openForm = false }: { search: Promise<SearchParams>; openForm?: boolean }) {
  await connection()
  if (!(await isAffiliateEnabled())) return closedEnrollment(openForm)
  const [session, raw] = await Promise.all([getSessionUser(), search])
  const userId = session?.verified ? session.id : undefined
  const account = userId ? await readAccount(userId) : null
  if (account?.status === 'active') redirect(await localized('/partners'))
  if (account) return applicationStatus(account)
  const settings = await readSettings()
  if (!(await publishedTerms(settings.terms_version))) return closedEnrollment(openForm)
  const parent = slugSchema.catch('').parse(raw.by)
  return <Intro><ApplicationEntry userId={userId} parent={parent} openForm={openForm} settings={settings} /></Intro>
}

function closedEnrollment(openForm: boolean) {
  if (openForm) notFound()
  return <Intro />
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

async function ApplicationEntry({ userId, parent, openForm, settings }: {
  userId?: string; parent: string; openForm: boolean; settings: Settings
}) {
  const applyPath = '/partners/apply' + (parent ? '?by=' + parent : '')
  const [t, eligible, returnPath] = await Promise.all([
    getTranslations('affiliate'),
    userId ? canApply(userId) : true,
    localized(applyPath),
  ])
  const applicationLogin = userId ? undefined : await localized(loginPath(returnPath))
  const memberLogin = loginPath(parent ? returnPath : await localized('/partners'))
  return (
    <div className="af-entry-actions">
      <ApplicationDialog initiallyOpen={openForm} title={t('apply')} description={t('formIntro')}>
        <ApplicationForm settings={settings} eligible={eligible} parent={parent} loginUrl={applicationLogin} />
      </ApplicationDialog>
      {!userId && <Link href={memberLogin} className="af-link">{t('memberLogin')}</Link>}
    </div>
  )
}

async function Intro({ children }: { children?: ReactNode }) {
  const t = await getTranslations('affiliate')
  return (
    <section className="af-intro">
      <h1>{t('programName')}</h1>
      <h2>{t('whatTitle')}</h2>
      <p>{t('intro')}</p>
      {children ?? <p role="status">{t('closed')}</p>}
      <h2>{t('benefitsTitle')}</h2>
      <p>{t('benefits')}</p>
      {children && <Link href="/partners/terms" className="af-link">{t('terms')}</Link>}
    </section>
  )
}
