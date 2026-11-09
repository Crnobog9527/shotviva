import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getSessionUser } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { Link } from '@/core/i18n/ui'
import { isAffiliateEnabled } from '../feature'
import { publishedTerms } from './terms'
import { CommissionList } from './commission-list'
import { viewHref } from './format'
import { SettingsForm } from './settings-form'
import { dashboardViews, searchSchema, type Account, type Query, type SearchParams } from './models'
import { Overview } from './overview'
import { PayoutList, ReferralList, TeamReport } from './reports'
import { readAccount, readSettings } from './repository'

async function guard() {
  await connection()
  if (!(await isAffiliateEnabled())) notFound()
}
async function Dashboard({ user, account, query }: { user: string; account: Account; query: Query }) {
  switch (query.view) {
    case 'commissions':
      return <CommissionList user={user} query={query} />
    case 'referrals':
      return <ReferralList user={user} query={query} />
    case 'payouts':
      return <PayoutList user={user} query={query} />
    case 'team': {
      if (!account.team_enabled) notFound()
      return <TeamReport user={user} query={query} account={account} />
    }
    case 'settings':
      return <SettingsForm account={account} settings={await readSettings()} />
    default:
      return <Overview user={user} account={account} settings={await readSettings()} />
  }
}
export async function PartnerScreen({ search }: { search: Promise<SearchParams> }) {
  await guard()
  const [user, t, raw] = await Promise.all([getSessionUser(), getTranslations('affiliate'), search])
  const query = searchSchema.parse(raw)
  const account = user?.verified ? await readAccount(user.id) : null
  if (!user?.verified || account?.status !== 'active') redirect(await localized('/partners/join'))
  return (
    <>
      <h1>{t('title')}</h1>
      <nav className="af-nav" aria-label={t('title')}>
        {dashboardViews
          .filter((v) => v !== 'team' || account.team_enabled)
          .map((view) => (
            <Link key={view} href={viewHref({ view })} aria-current={query.view === view ? 'page' : undefined}>
              {t('nav.' + view)}
            </Link>
          ))}
      </nav>
      <Dashboard user={user.id} account={account} query={query} />
    </>
  )
}

export async function TermsScreen() {
  await guard()
  const [t, settings] = await Promise.all([getTranslations('affiliate'), readSettings()])
  const body = await publishedTerms(settings.terms_version)
  return (
    <section className="af-intro">
      <h1>{t('terms')}</h1>
      {body && <p>{t('version', { version: settings.terms_version })}</p>}
      <div className="af-panel whitespace-pre-line">{body ?? t('termsPlaceholder')}</div>
      <Link className="af-link" href="/partners">
        {t('back')}
      </Link>
    </section>
  )
}
