import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AdminPage, StatCard } from '@/core/admin'
import { loadOrgDetail, ORGS_COPY as COPY } from '@/core/admin/orgs'
import { AddMemberForm, AffiliateCard, GrantForm, LedgerTable, MemberTable, num, OrgEditForm, OrgStatusBadge, SignupBonusForm } from '@/core/admin/orgs-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { ORG_SIGNUP_BONUS_MAX } from '@/core/org'

import { addMemberAction, grantOrgAction, saveOrgAction, saveSignupBonusAction, searchUsersAction } from '../actions'

export const instant = false

export async function generateMetadata() {
  return { title: COPY.title }
}

export default async function OrgPage({ params }: PageProps<'/[locale]/admin/orgs/[id]'>) {
  await requireAdmin()
  const { id } = await params
  const detail = await loadOrgDetail(createAdminSupabase(), id)
  if (!detail) notFound()
  const { org, caps, packages } = detail
  return (
    <AdminPage title={org.name} actions={<OrgStatusBadge status={org.status} />}>
      <Link href="/admin/orgs" className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:underline">← {COPY.back}</Link>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title={COPY.refCode} value={org.refCode} />
        <StatCard title={COPY.pool} value={num(org.poolCredits)} />
        <StatCard title={COPY.owner} value={detail.ownerAccount ?? '—'} />
      </div>
      <GrantForm orgId={org.id} packages={packages} grant={grantOrgAction} />
      <OrgEditForm key={org.updatedAt} org={org} caps={caps} save={saveOrgAction} />
      <SignupBonusForm key={`bonus-${org.updatedAt}`} org={org} max={ORG_SIGNUP_BONUS_MAX} given={detail.signupBonusUsers} save={saveSignupBonusAction} />
      <AffiliateCard affiliate={detail.affiliate} levels={org.affiliateLevels} />
      <LedgerTable rows={detail.ledger} />
      <AddMemberForm orgId={org.id} suspended={org.status !== 'active'} search={searchUsersAction} add={addMemberAction} />
      <MemberTable rows={detail.members} total={detail.memberTotal} />
    </AdminPage>
  )
}
