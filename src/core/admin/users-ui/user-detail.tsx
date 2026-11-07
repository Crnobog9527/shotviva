import { Button } from '@/core/ui/button'

import { StatCard } from '../shell/admin-blocks'
import { formatBeijing } from '../shell/format'
import type { JobSupportActions } from '../support-ui'
import type { UserDetailData } from '../users/detail-types'
import { RECENT_JOBS } from '../users/types'
import { GraylumBlock, RequestsBlock, SameIpBlock, SubscriptionBlock } from './account-blocks'
import { USERS_COPY as COPY } from './copy'
import { PaymentsBlock } from './payments-block'
import { UserActions, type UserAdminActions } from './user-actions'
import { LedgerTable, UserJobsTable } from './user-tables'

type Props = {
  data: UserDetailData
  actions: UserAdminActions
  // T25 support; focusJobId is the job a lookup landed on, highlighted in the jobs table.
  support: { stripeLive: boolean; jobActions: JobSupportActions; focusJobId: string | null }
  // Another ledger page; null is the first.
  onLedgerPage: (cursor: string | null) => void
}

// The user detail dialog's body (T77; the old /admin/users/[id] page): both pools, membership,
// the actions, recent jobs, payments, the account blocks (subscription, Graylum, same IP,
// requests), the ledger.
export function UserDetailView({ data, actions, support, onLedgerPage }: Props) {
  const { user, jobs, ledger, extras } = data
  return (
    <div className="grid gap-6">
      {/* Two cards a row on a phone leave ~130px: the figures step down a size so dates stay on one line. */}
      <div className="grid grid-cols-2 gap-3 max-sm:[&_p.font-mono]:text-lg md:grid-cols-4">
        <StatCard title={COPY.detail.paid} value={String(user.credits)} />
        <StatCard title={COPY.detail.free} value={String(user.freeCredits)} />
        <StatCard title={COPY.detail.paidUntil} value={formatBeijing(user.paidUntil)?.slice(0, 10) ?? COPY.never} hint={formatBeijing(user.paidUntil) ?? undefined} />
        <StatCard title={COPY.detail.registered} value={formatBeijing(user.createdAt)?.slice(0, 10) ?? COPY.never} />
      </div>
      <UserActions userId={user.id} banned={user.bannedAt !== null} balances={{ free: user.freeCredits, paid: user.credits }} actions={actions} />
      <section className="grid gap-2">
        <h3 className="font-semibold">{COPY.detail.recentJobs(RECENT_JOBS)}</h3>
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
        <h3 className="font-semibold">{COPY.detail.ledger}</h3>
        <LedgerTable entries={ledger.items} />
        <div className="flex gap-2">
          {data.ledgerPaged ? (
            <Button size="sm" variant="ghost" onClick={() => onLedgerPage(null)}>
              {COPY.detail.firstPage}
            </Button>
          ) : null}
          {ledger.nextCursor ? (
            <Button size="sm" variant="ghost" onClick={() => onLedgerPage(ledger.nextCursor)}>
              {COPY.detail.nextPage}
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  )
}
