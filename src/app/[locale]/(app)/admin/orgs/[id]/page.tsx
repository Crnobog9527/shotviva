import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { AdminPage, StatCard } from '@/core/admin'
import { listOrgWorks, OrgWorksSection, parseOrgWorkFilters, type OrgWorkFilters } from '@/core/admin/org-works'
import { CUSTOMER_COPY, loadOrgCustomerCounts, loadOrgCustomers, loadOrgDetail, loadOrgInviteToken, ORG_DETAIL_TABS, orgDetailTabHref, ORGS_COPY as COPY, parseOrgDetailTab, type OrgDetail, type OrgDetailTab } from '@/core/admin/orgs'
import { AddMemberForm, AffiliateCard, CustomerTable, GrantForm, LedgerTable, MemberTable, num, OrgEditForm, OrgStatusBadge, SignupBonusForm, StaffLinkCard, TransferOwnerForm } from '@/core/admin/orgs-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { ORG_SIGNUP_BONUS_MAX } from '@/core/org'
import { cn } from '@/core/ui/cn'

import { viewWorkAction } from '../../jobs/actions'
import { addMemberAction, grantOrgAction, saveOrgAction, saveSignupBonusAction, searchUsersAction, transferOwnerAction } from '../actions'

export const instant = false

export async function generateMetadata() {
  return { title: COPY.title }
}

const TAB = 'inline-flex min-h-11 shrink-0 items-center rounded-md px-4 text-sm font-medium whitespace-nowrap'

async function Overview({ db, detail }: { db: SupabaseClient; detail: OrgDetail }) {
  const { org } = detail
  const counts = await loadOrgCustomerCounts(db, org.id)
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard title={COPY.refCode} value={org.refCode} />
      <StatCard title={COPY.pool} value={num(org.poolCredits)} />
      <StatCard title={COPY.owner} value={detail.ownerAccount ?? '—'} />
      <StatCard title={CUSTOMER_COPY.l1} value={num(counts.l1)} />
      <StatCard title={CUSTOMER_COPY.l2} value={num(counts.l2)} />
      <StatCard title={CUSTOMER_COPY.bonusUsers} value={num(detail.signupBonusUsers)} />
    </div>
  )
}

// Each tab reads only what it shows beyond the org detail: the customer numbers on 概览, the staff
// link token on 成员, one page of customers on 推广名单, the works on 企业作品. Every form,
// confirmation and server action is the one the single page had.
async function TabBody({ tab, db, detail, workFilters, page }: { tab: OrgDetailTab; db: SupabaseClient; detail: OrgDetail; workFilters: OrgWorkFilters; page: number }) {
  const { org, caps, packages } = detail
  switch (tab) {
    case 'overview':
      return <Overview db={db} detail={detail} />
    case 'members':
      return (
        <>
          <StaffLinkCard token={await loadOrgInviteToken(db, org.id)} suspended={org.status !== 'active'} />
          <AddMemberForm orgId={org.id} suspended={org.status !== 'active'} search={searchUsersAction} add={addMemberAction} />
          <MemberTable orgId={org.id} rows={detail.members} total={detail.memberTotal} />
        </>
      )
    case 'promo':
      return (
        <>
          <AffiliateCard affiliate={detail.affiliate} levels={org.affiliateLevels} />
          <SignupBonusForm key={`bonus-${org.updatedAt}`} org={org} max={ORG_SIGNUP_BONUS_MAX} given={detail.signupBonusUsers} save={saveSignupBonusAction} />
          <CustomerTable orgId={org.id} data={await loadOrgCustomers(db, org.id, page)} hasAccount={detail.affiliate !== null} />
        </>
      )
    case 'credits':
      return (
        <>
          <GrantForm orgId={org.id} packages={packages} grant={grantOrgAction} />
          <LedgerTable rows={detail.ledger} />
        </>
      )
    case 'works': {
      const works = await listOrgWorks(db, org.id, workFilters)
      const members = detail.members.map((m) => ({ userId: m.userId, label: m.account ?? m.userId.slice(0, 8) }))
      return <OrgWorksSection orgId={org.id} filters={workFilters} page={works} members={members} actions={{ view: viewWorkAction }} />
    }
    case 'settings':
      return (
        <>
          <OrgEditForm key={org.updatedAt} org={org} caps={caps} save={saveOrgAction} />
          <TransferOwnerForm
            key={`owner-${org.ownerUserId}`}
            orgId={org.id}
            ownerId={org.ownerUserId}
            ownerLabel={detail.ownerAccount ?? org.ownerUserId}
            updatedAt={org.updatedAt}
            search={searchUsersAction}
            transfer={transferOwnerAction}
          />
        </>
      )
  }
}

// 企业客户 detail, split into tabs (?tab=). Anything tab-specific is read only after the org itself
// is found, so an unknown id is a 404 before any work is read.
export default async function OrgPage({ params, searchParams }: PageProps<'/[locale]/admin/orgs/[id]'>) {
  await requireAdmin()
  const { id } = await params
  const db = createAdminSupabase()
  const detail = await loadOrgDetail(db, id)
  if (!detail) notFound()
  const query = await searchParams
  const tab = parseOrgDetailTab(query)
  const { org } = detail
  return (
    <AdminPage title={org.name} actions={<OrgStatusBadge status={org.status} />}>
      <Link href="/admin/orgs" className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:underline">← {COPY.back}</Link>
      <nav className="flex flex-wrap gap-1 border-b border-border pb-1" aria-label={org.name}>
        {ORG_DETAIL_TABS.map((t) => (
          <Link key={t.key} href={orgDetailTabHref(org.id, t.key)} aria-current={t.key === tab ? 'page' : undefined} className={cn(TAB, t.key === tab ? 'bg-accent' : 'text-muted-foreground')}>{t.label}</Link>
        ))}
      </nav>
      <TabBody tab={tab} db={db} detail={detail} workFilters={parseOrgWorkFilters(query)} page={Number(typeof query.page === 'string' ? query.page : 1)} />
    </AdminPage>
  )
}
