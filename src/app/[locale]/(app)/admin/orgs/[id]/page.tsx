import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AdminPage, StatCard } from '@/core/admin'
import { listOrgWorks, OrgWorksSection, parseOrgWorkFilters } from '@/core/admin/org-works'
import { loadOrgDetail, ORGS_COPY as COPY } from '@/core/admin/orgs'
import { AddMemberForm, AffiliateCard, GrantForm, LedgerTable, MemberTable, num, OrgEditForm, OrgStatusBadge, SignupBonusForm, TransferOwnerForm } from '@/core/admin/orgs-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { ORG_SIGNUP_BONUS_MAX } from '@/core/org'

import { compensateJobAction, viewWorkAction } from '../../jobs/actions'
import { addMemberAction, grantOrgAction, saveOrgAction, saveSignupBonusAction, searchUsersAction, transferOwnerAction } from '../actions'

export const instant = false

export async function generateMetadata() {
  return { title: COPY.title }
}

// 企业作品 (the org's works, for finding the one a customer complains about) is read only after
// the org itself is found, so an unknown id is a 404 before any work is read.
export default async function OrgPage({ params, searchParams }: PageProps<'/[locale]/admin/orgs/[id]'>) {
  await requireAdmin()
  const { id } = await params
  const db = createAdminSupabase()
  const detail = await loadOrgDetail(db, id)
  if (!detail) notFound()
  const { org, caps, packages } = detail
  const workFilters = parseOrgWorkFilters(await searchParams)
  const works = await listOrgWorks(db, org.id, workFilters)
  const workMembers = detail.members.map((m) => ({ userId: m.userId, label: m.account ?? m.userId.slice(0, 8) }))
  return (
    <AdminPage title={org.name} actions={<OrgStatusBadge status={org.status} />}>
      <Link href="/admin/orgs" className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:underline">← {COPY.back}</Link>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title={COPY.refCode} value={org.refCode} />
        <StatCard title={COPY.pool} value={num(org.poolCredits)} />
        <StatCard title={COPY.owner} value={detail.ownerAccount ?? '—'} />
      </div>
      <TransferOwnerForm
        key={`owner-${org.ownerUserId}`}
        orgId={org.id}
        ownerId={org.ownerUserId}
        ownerLabel={detail.ownerAccount ?? org.ownerUserId}
        updatedAt={org.updatedAt}
        search={searchUsersAction}
        transfer={transferOwnerAction}
      />
      <GrantForm orgId={org.id} packages={packages} grant={grantOrgAction} />
      <OrgEditForm key={org.updatedAt} org={org} caps={caps} save={saveOrgAction} />
      <SignupBonusForm key={`bonus-${org.updatedAt}`} org={org} max={ORG_SIGNUP_BONUS_MAX} given={detail.signupBonusUsers} save={saveSignupBonusAction} />
      <AffiliateCard affiliate={detail.affiliate} levels={org.affiliateLevels} />
      <LedgerTable rows={detail.ledger} />
      <AddMemberForm orgId={org.id} suspended={org.status !== 'active'} search={searchUsersAction} add={addMemberAction} />
      <MemberTable orgId={org.id} rows={detail.members} total={detail.memberTotal} />
      <OrgWorksSection orgId={org.id} filters={workFilters} page={works} members={workMembers} actions={{ view: viewWorkAction, compensate: compensateJobAction }} />
    </AdminPage>
  )
}
