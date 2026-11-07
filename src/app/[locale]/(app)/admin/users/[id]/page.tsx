import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { accountLabel, AdminPage, ledgerPage, loadUser, loadUserExtras, recentJobs, UserDetailView, USERS_COPY } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { serverEnv } from '@/core/env'

import { compensateJobAction, viewWorkAction } from '../../jobs/actions'
import { adjustCreditsAction, banUserAction, unbanUserAction } from '../actions'

export const instant = false

export const metadata: Metadata = { title: USERS_COPY.title }

export default async function AdminUserPage({ params, searchParams }: PageProps<'/[locale]/admin/users/[id]'>) {
  await requireAdmin()
  const [{ id }, { cursor, job }] = await Promise.all([params, searchParams])
  const db = createAdminSupabase()
  const page = typeof cursor === 'string' ? cursor : null
  const focusJobId = typeof job === 'string' ? job : null
  const [user, jobs, ledger] = await Promise.all([loadUser(db, id), recentJobs(db, id, focusJobId), ledgerPage(db, id, page)])
  if (!user) notFound()
  const extras = await loadUserExtras(db, user)
  return (
    <AdminPage title={accountLabel(user)}>
      <UserDetailView
        user={user}
        jobs={jobs}
        ledger={ledger}
        ledgerPaged={page !== null}
        actions={{ adjust: adjustCreditsAction, ban: banUserAction, unban: unbanUserAction }}
        support={{
          extras,
          stripeLive: serverEnv().VERCEL_ENV === 'production',
          jobActions: { view: viewWorkAction, compensate: compensateJobAction },
          focusJobId,
        }}
      />
    </AdminPage>
  )
}
