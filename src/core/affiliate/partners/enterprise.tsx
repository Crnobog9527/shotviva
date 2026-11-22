import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getSessionUser } from '@/core/auth'
import { localized } from '@/core/i18n/server'
import { Link } from '@/core/i18n/ui'
// Straight from the file: the org ui index carries client panels that public /partners pages must not reach.
import { EnterpriseFrame } from '@/core/org/ui/enterprise-frame'
import { cn } from '@/core/ui/cn'
import { isAffiliateEnabled } from '../feature'
import { dashboardViews, searchSchema, type Account, type SearchParams, type View } from './models'
import { viewHref } from './format'
import { isOrgMember, readAccount, readOrgName } from './repository'
import { Dashboard } from './screen'

// The enterprise affiliate dashboard (ARCHITECTURE §6.5, card E4): the org owner's partner
// account, run by the same views as the personal program (commissions, referrals, statements,
// payout details). It is 「企业联盟」, the first section of the owner's enterprise area, inside the
// same frame as the workspace and the purchasing page (Owner 2026-11-22). Members have no
// commissions to see (their card on /account shows their own customers); anyone else is sent to
// the program page.
export async function EnterpriseScreen({ search }: { search: Promise<SearchParams> }) {
  const [{ user, account, orgId }, raw] = await Promise.all([orgAccount(), search])
  const query = searchSchema.parse(raw)
  const [t, orgName] = await Promise.all([getTranslations('app.org.area'), readOrgName(orgId)])
  return (
    <EnterpriseFrame
      orgName={orgName ?? ''}
      current="affiliate"
      affiliate
      intro={t('affiliateIntro')}
      subnav={<DashboardNav view={query.view} account={account} />}
    >
      <div className="af-embed af-dash-body">
        <Dashboard user={user.id} account={account} query={query} />
      </div>
    </EnterpriseFrame>
  )
}

// The signed-in org account, or the way out for everyone else (404 while the program is off).
async function orgAccount() {
  await connection()
  if (!(await isAffiliateEnabled())) notFound()
  const user = await getSessionUser()
  const account = user?.verified ? await readAccount(user.id) : null
  if (!user?.verified || !account?.org_id) redirect(await localized(await elsewhere(user?.verified ? user.id : null)))
  return { user, account, orgId: account.org_id }
}

// Where someone who is not an org account belongs: their card on /account for an org member, the program page for anyone else.
async function elsewhere(user: string | null) {
  return user && (await isOrgMember(user)) ? '/account' : '/partners/join'
}

// The dashboard's own views: a chip rail under the sections on a phone, a list under 「企业联盟」
// in the side column from lg up. The referral code sits under it, where the old header had it.
async function DashboardNav({ view, account }: { view: View; account: Account }) {
  const t = await getTranslations('affiliate')
  const views = dashboardViews.filter((v) => v !== 'team' || account.team_enabled)
  return (
    <div className="space-y-3">
      <nav aria-label={t('dashboardTitle')} className="no-scrollbar -mx-(--gutter) overflow-x-auto px-(--gutter) lg:mx-0 lg:overflow-visible lg:px-0">
        <ul className="flex gap-2 lg:flex-col lg:gap-0.5">
          {views.map((v) => (
            <li key={v} className="shrink-0">
              <Link
                href={viewHref({ view: v })}
                aria-current={view === v ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-10 items-center rounded-full px-4 text-label font-medium whitespace-nowrap transition-[color,background-color,scale] active:scale-[0.975]',
                  'lg:flex lg:min-h-10 lg:rounded-inner lg:px-3.5 lg:pl-7',
                  view === v
                    ? 'bg-foreground text-background lg:bg-wash lg:text-foreground'
                    : 'bg-wash text-bone-dim shadow-[inset_0_0_0_1px_var(--border)] hover:text-foreground lg:bg-transparent lg:shadow-none lg:hover:bg-wash',
                )}
              >
                {t('nav.' + v)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="hidden text-caption text-muted-foreground lg:block lg:pl-3.5">
        {t('codeLabel')} <code className="font-mono text-bone-dim">{account.slug}</code>
      </p>
    </div>
  )
}
