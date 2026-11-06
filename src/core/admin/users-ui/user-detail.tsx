import Link from 'next/link'

import { StatCard } from '../shell/admin-blocks'
import { formatBeijing } from '../shell/format'
import type { Page } from '../cursor'
import type { UserExtras } from '../users/detail-types'
import { RECENT_JOBS, type LedgerEntry, type UserDetail, type UserJob } from '../users/types'
import type { JobSupportActions } from '../support-ui'
import { GraylumBlock, RequestsBlock, SameIpBlock, SubscriptionBlock } from './account-blocks'
import { USERS_COPY as COPY } from './copy'
import { PaymentsBlock } from './payments-block'
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
  // T25 blocks; focusJobId is the job a lookup landed on, highlighted in the jobs table.
  support: { extras: UserExtras; stripeLive: boolean; jobActions: JobSupportActions; focusJobId: string | null }
}

// /admin/users/[id]: both pools, membership, status, the actions, recent jobs, payments, the
// account blocks (subscription, Graylum, same IP, requests), the ledger.
export function UserDetailView({ user, jobs, ledger, ledgerPaged, actions, support }: Props) {
  const { extras } = support
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
      <UserActions userId={user.id} banned={user.bannedAt !== null} balances={{ free: user.freeCredits, paid: user.credits }} actions={actions} />
      <section className="grid gap-2">
        <h2 className="font-semibold">{COPY.detail.recentJobs(RECENT_JOBS)}</h2>
        <UserJobsTable jobs={jobs} actions={support.jobActions} highlight={support.focusJobId ?? undefined} />
      </section>
      <PaymentsBlock payments={extras.payments} stripeLive={support.stripeLive} />
      <div className="grid gap-3 md:grid-cols-2">
        <SubscriptionBlock subscription={extras.subscription} />
        <GraylumBlock link={extras.graylum} />
        <SameIpBlock signupIp={extras.signupIp} accounts={extras.sameIp} />
        <RequestsBlock requests={extras.requests} />
      </div>
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
