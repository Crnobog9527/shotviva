import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AdminPage, StatCard } from '@/core/admin'
import { loadOrgDetail, ORGS_COPY as COPY } from '@/core/admin/orgs'
import { AffiliateCard, GrantForm, LedgerTable, MemberTable, num, OrgEditForm, OrgStatusBadge } from '@/core/admin/orgs-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

import { grantOrgAction, saveOrgAction } from '../actions'

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
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard title={COPY.pool} value={num(org.poolCredits)} />
        <StatCard title={COPY.owner} value={detail.ownerAccount ?? '—'} />
      </div>
      <GrantForm orgId={org.id} packages={packages} grant={grantOrgAction} />
      <OrgEditForm key={org.updatedAt} org={org} caps={caps} save={saveOrgAction} />
      <AffiliateCard affiliate={detail.affiliate} levels={org.affiliateLevels} />
      <LedgerTable rows={detail.ledger} />
      <MemberTable rows={detail.members} total={detail.memberTotal} />
    </AdminPage>
  )
}
