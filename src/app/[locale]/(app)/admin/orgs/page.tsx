import Link from 'next/link'
import type { Metadata } from 'next'

import { AdminPage } from '@/core/admin'
import { listOrgs, listPackages, ORGS_COPY as COPY } from '@/core/admin/orgs'
import { CreateOrgForm, OrgTable, PackageEditor } from '@/core/admin/orgs-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { cn } from '@/core/ui/cn'

import { createOrgAction, savePackageAction } from './actions'

export const instant = false
export const metadata: Metadata = { title: COPY.title }

const TAB = 'inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium'

// 企业客户 (ARCHITECTURE §6.5, card E3): the list and creation, and the 「套餐」tab.
export default async function OrgsPage({ searchParams }: PageProps<'/[locale]/admin/orgs'>) {
  await requireAdmin()
  const { tab } = await searchParams
  const packages = tab === 'packages'
  const db = createAdminSupabase()
  return (
    <AdminPage title={COPY.title}>
      <nav className="flex gap-1 border-b border-border" aria-label={COPY.title}>
        <Link href="/admin/orgs" aria-current={packages ? undefined : 'page'} className={cn(TAB, packages ? 'text-muted-foreground' : 'bg-accent')}>{COPY.tabOrgs}</Link>
        <Link href="/admin/orgs?tab=packages" aria-current={packages ? 'page' : undefined} className={cn(TAB, packages ? 'bg-accent' : 'text-muted-foreground')}>{COPY.tabPackages}</Link>
      </nav>
      {packages ? (
        <PackageEditor packages={await listPackages(db)} save={savePackageAction} />
      ) : (
        <>
          <CreateOrgForm create={createOrgAction} />
          <OrgTable orgs={await listOrgs(db)} />
        </>
      )}
    </AdminPage>
  )
}
