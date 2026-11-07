import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AdminPage, listUsers, LOOKUP_PARAM, lookupHref, lookupUser, parseUserFilters, USERS_COPY, usersHref, UsersListView } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

import { batchAdjustCreditsAction, batchSetBannedAction } from './actions'

// /admin/users (ARCHITECTURE §10.a, T77): the list of users, 50 a page, filtered and sorted from
// the URL. Pressing 查找 (?lookup=1) runs admin_lookup once: a unique hit (id, order number, an
// email substring only one account has) opens that user's dialog over the list, anything else
// filters the list; either way the flag is redirected away, so the dialog never reopens on its
// own. The dialog (?user=) is mounted by the admin layout.
export const instant = false

export const metadata: Metadata = { title: USERS_COPY.title }

export default async function AdminUsersPage({ searchParams }: PageProps<'/[locale]/admin/users'>) {
  const admin = await requireAdmin()
  const params = await searchParams
  const filters = parseUserFilters(params)
  const db = createAdminSupabase()
  if (params[LOOKUP_PARAM] !== undefined) {
    const hit = filters.q ? await lookupUser(db, filters.q) : null
    redirect(hit ? lookupHref(hit, filters) : usersHref(filters))
  }
  const list = await listUsers(db, filters)
  const suspicious = (
    <Link href="/admin/users/suspicious" className="text-sm text-primary hover:underline">
      {USERS_COPY.suspiciousLink}
    </Link>
  )
  return (
    <AdminPage title={USERS_COPY.title} actions={suspicious}>
      <UsersListView filters={filters} list={list} actions={{ adjust: batchAdjustCreditsAction, setBanned: batchSetBannedAction }} currentUserId={admin.id} />
    </AdminPage>
  )
}
