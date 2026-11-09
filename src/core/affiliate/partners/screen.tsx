import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getSessionUser, requireUser } from '@/core/auth'
import { currentLocale, localized } from '@/core/i18n/server'
import { Link } from '@/core/i18n/ui'
import { isAffiliateEnabled } from '../feature'
import { CommissionList } from './commission-list'
import { money, percent, viewHref } from './format'
import { ApplicationForm, SettingsForm } from './forms'
import { dashboardViews, searchSchema, slugSchema, type Account, type Query, type SearchParams } from './models'
import { Overview } from './overview'
import { PayoutList, ReferralList, TeamReport } from './reports'
import { canApply, readAccount, readDefaultRates, readSettings } from './repository'

async function guard() {
  await connection()
  if (!(await isAffiliateEnabled())) notFound()
}
function isEnrolled(account: Account | null): account is Account {
  return !!account && ['active', 'suspended', 'banned'].includes(account.status)
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
  if (!user || !isEnrolled(account)) return <Landing account={account} />
  return (
    <>
      <h1>{t('title')}</h1>
      {account.status !== 'active' && <p className="af-banner">{t('status.' + account.status)}</p>}
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

async function Landing({ account }: { account: Account | null }) {
  const [t, locale, rates, settings] = await Promise.all([
    getTranslations('affiliate'),
    currentLocale(),
    readDefaultRates(),
    readSettings(),
  ])
  return (
    <section className="af-intro">
      <h1>{t('title')}</h1>
      <p>{t('intro')}</p>
      <dl className="af-metrics">
        {rates.map((row) => (
          <div key={row.product_kind}>
            <dt>{t('kind.' + row.product_kind)}</dt>
            <dd>{percent(locale, row.l1_bp)}</dd>
          </div>
        ))}
      </dl>
      <p>
        {t('payoutSchedule', {
          days: settings.hold_days,
          day: settings.settlement_day,
          threshold: money(locale, settings.payout_min_usd),
        })}
      </p>
      {account ? (
        <aside className="af-panel" role="status">
          <h2>{account.status === 'pending' ? t('pendingApplication') : t('status.' + account.status)}</h2>
          <p>{account.status === 'rejected' ? account.reject_reason : t('pendingReview')}</p>
        </aside>
      ) : (
        <Link href="/partners/apply" className="af-button">
          {t('apply')}
        </Link>
      )}
      <Link href="/partners/terms" className="af-link">
        {t('terms')}
      </Link>
    </section>
  )
}

export async function ApplyScreen({ search }: { search: Promise<SearchParams> }) {
  await guard()
  const { by } = await search
  const parsed = slugSchema.safeParse(by)
  const parent = parsed.success ? parsed.data : ''
  const user = await requireUser('/partners/apply' + (parent ? '?by=' + parent : ''))
  const [account, settings, eligible, t] = await Promise.all([
    readAccount(user.id),
    readSettings(),
    canApply(user.id),
    getTranslations('affiliate'),
  ])
  if (account) redirect(await localized('/partners'))
  return (
    <>
      <h1>{t('apply')}</h1>
      <ApplicationForm parent={parent} eligible={eligible} settings={settings} />
    </>
  )
}

export async function TermsScreen() {
  await guard()
  const [t, settings] = await Promise.all([getTranslations('affiliate'), readSettings()])
  return (
    <section className="af-intro">
      <h1>{t('terms')}</h1>
      <p>{t('version', { version: settings.terms_version })}</p>
      <div className="af-panel">{t('termsPlaceholder')}</div>
      <Link className="af-link" href="/partners">
        {t('back')}
      </Link>
    </section>
  )
}
