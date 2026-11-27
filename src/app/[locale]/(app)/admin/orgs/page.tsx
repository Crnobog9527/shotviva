import Link from 'next/link'
import type { Metadata } from 'next'
import type { SupabaseClient } from '@supabase/supabase-js'

import { AdminPage } from '@/core/admin'
import { listOrgs, listPackages, listPaymentAccounts, loadPickerUser, ORGS_COPY as COPY } from '@/core/admin/orgs'
import { CreateOrgForm, OrgSearch, OrgTable, PackageEditor, PaymentAccounts } from '@/core/admin/orgs-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { cn } from '@/core/ui/cn'

import { createOrgAction, savePackageAction, savePaymentAccountAction, searchUsersAction } from './actions'

export const instant = false
export const metadata: Metadata = { title: COPY.title }

const TAB = 'inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium'
const TABS = [
  { key: 'orgs', href: '/admin/orgs', label: COPY.tabOrgs },
  { key: 'packages', href: '/admin/orgs?tab=packages', label: COPY.tabPackages },
  { key: 'payment', href: '/admin/orgs?tab=payment', label: COPY.tabPayment },
] as const

async function TabBody({ tab, db, owner, q }: { tab: string; db: SupabaseClient; owner: string | undefined; q: string }) {
  if (tab === 'payment') return <PaymentAccounts accounts={await listPaymentAccounts(db)} save={savePaymentAccountAction} />
  if (tab === 'packages') return <PackageEditor packages={await listPackages(db)} save={savePackageAction} />
  // ?owner=<user id>: opened from a user's dossier with that account filled in as the owner.
  const initialOwner = owner ? await loadPickerUser(db, owner) : null
  return (
    <>
      <CreateOrgForm key={initialOwner?.id ?? 'new'} create={createOrgAction} search={searchUsersAction} initialOwner={initialOwner} ownerMissing={Boolean(owner) && !initialOwner} />
      <OrgSearch q={q} />
      <OrgTable orgs={await listOrgs(db, q)} searching={q.trim() !== ''} />
    </>
  )
}

// 企业客户 (ARCHITECTURE §6.5, card E3): the list and creation, the 「套餐」tab and the 「收款账户」tab.
export default async function OrgsPage({ searchParams }: PageProps<'/[locale]/admin/orgs'>) {
  await requireAdmin()
  const { tab, owner, q } = await searchParams
  const current = TABS.find((t) => t.key === tab)?.key ?? 'orgs'
  return (
    <AdminPage title={COPY.title}>
      <nav className="flex gap-1 border-b border-border" aria-label={COPY.title}>
        {TABS.map((t) => (
          <Link key={t.key} href={t.href} aria-current={t.key === current ? 'page' : undefined} className={cn(TAB, t.key === current ? 'bg-accent' : 'text-muted-foreground')}>{t.label}</Link>
        ))}
      </nav>
      <TabBody tab={current} db={createAdminSupabase()} owner={typeof owner === 'string' ? owner : undefined} q={typeof q === 'string' ? q : ''} />
    </AdminPage>
  )
}
