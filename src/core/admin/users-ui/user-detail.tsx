import Link from 'next/link'

import { StatCard } from '../shell/admin-blocks'
import { formatBeijing } from '../shell/format'
import type { Page } from '../cursor'
import { RECENT_JOBS, type LedgerEntry, type UserDetail, type UserJob } from '../users/types'
import { USERS_COPY as COPY } from './copy'
import { UserActions, type UserAdminActions } from './user-actions'
import { UserStatus } from './users-search'
import { LedgerTable, UserJobsTable } from './user-tables'

type Props = {
  user: UserDetail
  jobs: UserJob[]
  ledger: Page<LedgerEntry>
  // Whether this is a later ledger page (offers a way back to the first).
  ledgerPaged: boolean
  actions: UserAdminActions
}

// /admin/users/[id]: both pools, membership, status, the actions, recent jobs, the ledger.
export function UserDetailView({ user, jobs, ledger, ledgerPaged, actions }: Props) {
  const base = `/admin/users/${user.id}`
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/users" className="text-sm text-primary hover:underline">
          {COPY.detail.back}
        </Link>
        <UserStatus role={user.role} bannedAt={user.bannedAt} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard title={COPY.detail.paid} value={String(user.credits)} />
        <StatCard title={COPY.detail.free} value={String(user.freeCredits)} />
        <StatCard title={COPY.detail.paidUntil} value={formatBeijing(user.paidUntil)?.slice(0, 10) ?? COPY.never} hint={formatBeijing(user.paidUntil) ?? undefined} />
        <StatCard title={COPY.detail.registered} value={formatBeijing(user.createdAt)?.slice(0, 10) ?? COPY.never} />
      </div>
      <UserActions userId={user.id} banned={user.bannedAt !== null} actions={actions} />
      <section className="grid gap-2">
        <h2 className="font-semibold">{COPY.detail.recentJobs(RECENT_JOBS)}</h2>
        <UserJobsTable jobs={jobs} />
      </section>
      <section className="grid gap-2">
        <h2 className="font-semibold">{COPY.detail.ledger}</h2>
        <LedgerTable entries={ledger.items} />
        <div className="flex gap-4 text-sm">
          {ledgerPaged ? (
            <Link href={base} className="text-primary hover:underline">
              {COPY.detail.firstPage}
            </Link>
          ) : null}
          {ledger.nextCursor ? (
            <Link href={`${base}?cursor=${ledger.nextCursor}`} className="text-primary hover:underline">
              {COPY.detail.nextPage}
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  )
}
