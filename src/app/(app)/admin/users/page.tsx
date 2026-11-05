import type { Metadata } from 'next'

import { AdminPage, searchUsers, USERS_COPY, UsersSearch } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

// /admin/users (ARCHITECTURE §10): email search through admin_search_users, at most 50 rows.
export const instant = false

export const metadata: Metadata = { title: USERS_COPY.title }

export default async function AdminUsersPage({ searchParams }: PageProps<'/admin/users'>) {
  await requireAdmin()
  const { q } = await searchParams
  const query = typeof q === 'string' ? q.slice(0, 200) : ''
  const rows = query.trim() ? await searchUsers(createAdminSupabase(), query) : null
  return (
    <AdminPage title={USERS_COPY.title}>
      <UsersSearch query={query} rows={rows} />
    </AdminPage>
  )
}
