import type { Metadata } from 'next'

import { AdminPage, listSignupClusters, parseClusterWindow, SuspiciousView, USERS_COPY } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

import { banUserAction } from '../actions'

// /admin/users/suspicious (ARCHITECTURE §10「可疑注册」, T25): IPs with 3+ signups in 24h / 7 days.
export const instant = false

export const metadata: Metadata = { title: USERS_COPY.suspicious.title }

export default async function AdminSuspiciousPage({ searchParams }: PageProps<'/[locale]/admin/users/suspicious'>) {
  await requireAdmin()
  const days = parseClusterWindow((await searchParams).days)
  const clusters = await listSignupClusters(createAdminSupabase(), days)
  return (
    <AdminPage title={USERS_COPY.suspicious.title}>
      <SuspiciousView days={days} clusters={clusters} ban={banUserAction} />
    </AdminPage>
  )
}
