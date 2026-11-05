import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AdminPage, ledgerPage, loadUser, recentJobs, UserDetailView, USERS_COPY } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

import { adjustCreditsAction, banUserAction, unbanUserAction } from '../actions'

export const instant = false

export const metadata: Metadata = { title: USERS_COPY.title }

export default async function AdminUserPage({ params, searchParams }: PageProps<'/admin/users/[id]'>) {
  await requireAdmin()
  const [{ id }, { cursor }] = await Promise.all([params, searchParams])
  const db = createAdminSupabase()
  const page = typeof cursor === 'string' ? cursor : null
  const [user, jobs, ledger] = await Promise.all([loadUser(db, id), recentJobs(db, id), ledgerPage(db, id, page)])
  if (!user) notFound()
  return (
    <AdminPage title={user.email ?? user.id}>
      <UserDetailView
        user={user}
        jobs={jobs}
        ledger={ledger}
        ledgerPaged={page !== null}
        actions={{ adjust: adjustCreditsAction, ban: banUserAction, unban: unbanUserAction }}
      />
    </AdminPage>
  )
}
