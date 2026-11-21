import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getSessionUser } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { Link } from '@/core/i18n/ui'
import { isAffiliateEnabled } from '../feature'
import { dashboardViews, searchSchema, type Account, type SearchParams, type View } from './models'
import { viewHref } from './format'
import { isOrgMember, readAccount } from './repository'
import { Dashboard } from './screen'

// The enterprise affiliate dashboard (ARCHITECTURE §6.5, card E4): the org owner's partner
// account, run by the same views as the personal program (commissions, referrals, statements,
// payout details). It is the 「企业联盟」 tab of the owner's enterprise area in the account centre.
// Members have no commissions to see (their card on /account shows their own customers); anyone
// else is sent to the program page.
export async function EnterpriseScreen({ search }: { search: Promise<SearchParams> }) {
  await connection()
  if (!(await isAffiliateEnabled())) notFound()
  const [user, raw] = await Promise.all([getSessionUser(), search])
  const account = user?.verified ? await readAccount(user.id) : null
  if (!user?.verified || !account?.org_id) redirect(await localized(await elsewhere(user?.verified ? user.id : null)))
  const query = searchSchema.parse(raw)
  return (
    <div className="af-dash">
      <EnterpriseHeader account={account} />
      <EnterpriseNav view={query.view} teamEnabled={account.team_enabled} />
      <div className="af-dash-body">
        <Dashboard user={user.id} account={account} query={query} />
      </div>
    </div>
  )
}

// Where someone who is not an org account belongs: their card on /account for an org member, the program page for anyone else.
async function elsewhere(user: string | null) {
  return user && (await isOrgMember(user)) ? '/account' : '/partners/join'
}

async function EnterpriseHeader({ account }: { account: Account }) {
  const t = await getTranslations('affiliate')
  return (
    <header className="af-dash-head">
      <div>
        <Link href="/account" className="af-back">{t('backToAccount')}</Link>
        <h1>{t('enterprise.title')}</h1>
        <p className="af-dash-meta">
          <span className={`af-pill ${account.status === 'active' ? 'af-pill-ok' : ''}`}>{t('enterprise.pill')}</span>
          <span>{t('codeLabel')}</span> <code className="af-code">{account.slug}</code>
        </p>
      </div>
    </header>
  )
}

// The two areas of an org owner (console and affiliate), then the dashboard's own views.
async function EnterpriseNav({ view, teamEnabled }: { view: View; teamEnabled: boolean }) {
  const [t, org] = await Promise.all([getTranslations('affiliate'), getTranslations('app.org')])
  return (
    <>
      <nav className="af-nav" aria-label={org('tabs.label')}>
        <Link href="/account/enterprise">{org('tabs.console')}</Link>
        <Link href="/partners/enterprise" aria-current="page">{org('tabs.affiliate')}</Link>
      </nav>
      <nav className="af-nav" aria-label={t('dashboardTitle')}>
        {dashboardViews.filter((v) => v !== 'team' || teamEnabled).map((v) => (
          <Link key={v} href={viewHref({ view: v })} aria-current={view === v ? 'page' : undefined}>{t('nav.' + v)}</Link>
        ))}
      </nav>
    </>
  )
}
