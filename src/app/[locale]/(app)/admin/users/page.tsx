import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AdminPage, listUsers, lookupHref, lookupUser, parseUserFilters, USERS_COPY, UsersListView } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

import { batchAdjustCreditsAction, batchSetBannedAction } from './actions'

// /admin/users (ARCHITECTURE §10.a, T77): the list of users, 50 a page, filtered and sorted from
// the URL. The lookup box still opens the one user an id, an order number or a one-account email
// substring points at (admin_lookup): as the detail dialog over this list (?user=, mounted by
// the admin layout). With ?user= already set the lookup is skipped, so it never loops.
export const instant = false

export const metadata: Metadata = { title: USERS_COPY.title }

export default async function AdminUsersPage({ searchParams }: PageProps<'/[locale]/admin/users'>) {
  await requireAdmin()
  const params = await searchParams
  const filters = parseUserFilters(params)
  const db = createAdminSupabase()
  const hit = filters.q && !params.user ? await lookupUser(db, filters.q) : null
  if (hit) redirect(lookupHref(hit, filters.q ?? ''))
  const list = await listUsers(db, filters)
  const suspicious = (
    <Link href="/admin/users/suspicious" className="text-sm text-primary hover:underline">
      {USERS_COPY.suspiciousLink}
    </Link>
  )
  return (
    <AdminPage title={USERS_COPY.title} actions={suspicious}>
      <UsersListView filters={filters} list={list} actions={{ adjust: batchAdjustCreditsAction, setBanned: batchSetBannedAction }} />
    </AdminPage>
  )
}
