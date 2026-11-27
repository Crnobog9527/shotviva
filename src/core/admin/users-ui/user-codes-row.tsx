import Link from 'next/link'

import type { UserExtras } from '../users/detail-types'
import { USERS_COPY } from './copy'
import { UserLink } from './user-link'

const COPY = USERS_COPY.dialog

export function UserCodesRow({ history, onPage }: { history: UserExtras['codeHistory']; onPage: (cursor: string | null) => void }) {
  const { inviterId, inviteCode, blockedInvite, campaigns, paged } = history
  return (
    <dl className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
      <dt className="text-muted-foreground">{COPY.inviter}</dt>
      <dd>{inviterId ? <UserLink userId={inviterId}>{inviteCode ?? inviterId}</UserLink> : COPY.none}</dd>
      {blockedInvite && <BlockedInvite attempt={blockedInvite} />}
      <dt className="text-muted-foreground">{COPY.redeemedCodes}</dt>
      <dd className="flex flex-wrap gap-2">
        {inviteCode && <span>{inviteCode}</span>}
        {campaigns.items.map(item => <Link key={item.id} href={'/admin/codes/' + item.id} className="text-primary underline">{item.code}</Link>)}
        {!inviteCode && !campaigns.items.length && COPY.none}
        {paged && <button type="button" onClick={() => onPage(null)}>{COPY.firstCodes}</button>}
        {campaigns.nextCursor && <button type="button" onClick={() => onPage(campaigns.nextCursor)}>{COPY.moreCodes}</button>}
      </dd>
    </dl>
  )
}

// A refused invite attempt: the code, its owner and why it did not apply (2025 / 2030), so an
// admin can see why the customer is not attributed.
function BlockedInvite({ attempt }: { attempt: NonNullable<UserExtras['codeHistory']['blockedInvite']> }) {
  return (
    <>
      <dt className="text-muted-foreground">{COPY.blockedInvite}</dt>
      <dd>
        {attempt.code ?? '—'}
        {attempt.inviterId && <> · {COPY.blockedInviter} <UserLink userId={attempt.inviterId}>{attempt.inviterId.slice(0, 8)}</UserLink></>}
        {' · '}{COPY.blockedReason(attempt.status, attempt.retries)}
      </dd>
    </>
  )
}
