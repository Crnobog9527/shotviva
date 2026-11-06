import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AdminPage, lookupHref, lookupUser, searchUsers, USERS_COPY, UsersSearch } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

// /admin/users (ARCHITECTURE §10): the lookup box. admin_lookup opens the one user an id or email
// points at; otherwise the email substring list from admin_search_users, at most 50 rows.
export const instant = false

export const metadata: Metadata = { title: USERS_COPY.title }

export default async function AdminUsersPage({ searchParams }: PageProps<'/[locale]/admin/users'>) {
  await requireAdmin()
  const { q } = await searchParams
  const query = typeof q === 'string' ? q.slice(0, 200) : ''
  const db = createAdminSupabase()
  const hit = query.trim() ? await lookupUser(db, query) : null
  if (hit) redirect(lookupHref(hit))
  const rows = query.trim() ? await searchUsers(db, query) : null
  const suspicious = (
    <Link href="/admin/users/suspicious" className="text-sm text-primary hover:underline">
      {USERS_COPY.suspiciousLink}
    </Link>
  )
  return (
    <AdminPage title={USERS_COPY.title} actions={suspicious}>
      <UsersSearch query={query} rows={rows} />
    </AdminPage>
  )
}
