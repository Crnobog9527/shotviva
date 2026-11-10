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
    <div className="af-dash">
      <header className="af-dash-head">
        <div>
          <h1>{t('dashboardTitle')}</h1>
          <p className="af-dash-meta">
            <span className="af-pill af-pill-ok">{t('status.active')}</span>
            <span>{t('codeLabel')}</span> <code className="af-code">{account.slug}</code>
          </p>
        </div>
      </header>
      <nav className="af-nav" aria-label={t('dashboardTitle')}>
        {dashboardViews
          .filter((v) => v !== 'team' || account.team_enabled)
          .map((view) => (
            <Link key={view} href={viewHref({ view })} aria-current={query.view === view ? 'page' : undefined}>
              {t('nav.' + view)}
            </Link>
          ))}
      </nav>
      <div className="af-dash-body">
        <Dashboard user={user.id} account={account} query={query} />
      </div>
    </div>
  )
}

export async function TermsScreen() {
  await guard()
  const [t, settings] = await Promise.all([getTranslations('affiliate'), readSettings()])
  const body = await publishedTerms(settings.terms_version)
  return (
    <article className="af-doc">
      <Link className="af-back" href="/partners/join">{t('backToProgram')}</Link>
      <h1>{t('terms')}</h1>
      {body && <p className="af-dash-meta">{t('version', { version: settings.terms_version })}</p>}
      <div className="af-doc-body">{body ?? t('termsPlaceholder')}</div>
    </article>
  )
}
