import Link from 'next/link'
import type { ReactNode } from 'react'

import { Badge } from '@/core/ui/badge'

import { formatBeijing } from '../shell/format'
import { SAME_IP_ROWS, type GraylumLink, type SameIpAccount, type UserRequest, type UserSubscription } from '../users/detail-types'
import { USERS_COPY } from './copy'

const COPY = USERS_COPY.extras
const day = (iso: string | null) => formatBeijing(iso)?.slice(0, 10) ?? USERS_COPY.never

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid content-start gap-2 rounded-lg border border-border p-4 text-sm">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  )
}

const muted = (text: string) => <p className="text-muted-foreground">{text}</p>

export function SubscriptionBlock({ subscription }: { subscription: UserSubscription }) {
  return (
    <Block title={COPY.subscription}>
      <p>{COPY.tier(subscription.tier)}</p>
      {subscription.subscriptions.length === 0
        ? muted(COPY.noSubscription)
        : subscription.subscriptions.map((sub) => (
            <p key={sub.id} className="font-mono text-xs [overflow-wrap:anywhere]">
              {COPY.subscriptionLine(sub.productId, sub.status, day(sub.periodEnd), sub.cancelAtPeriodEnd)}
              <span className="block text-muted-foreground">{sub.id}</span>
            </p>
          ))}
    </Block>
  )
}

function graylumText(link: GraylumLink): string {
  if (link.connected) return COPY.graylumConnected(formatBeijing(link.linkedAt) ?? '')
  if (link.revokedAt) return COPY.graylumRevoked(formatBeijing(link.revokedAt) ?? '')
  return COPY.graylumPending
}

export function GraylumBlock({ link }: { link: GraylumLink | null }) {
  return (
    <Block title={COPY.graylum}>
      {link ? <p>{graylumText(link)}</p> : muted(COPY.graylumNone)}
    </Block>
  )
}

export function SameIpBlock({ signupIp, accounts }: { signupIp: string | null; accounts: SameIpAccount[] }) {
  return (
    <Block title={COPY.sameIp}>
      <p className="font-mono text-xs">{COPY.signupIp(signupIp)}</p>
      {accounts.length === 0 ? muted(COPY.noSameIp) : null}
      <ul className="grid gap-1">
        {accounts.map((account) => (
          <li key={account.id} className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/users/${account.id}`} className="font-mono text-xs text-primary hover:underline">
              {account.id.slice(0, 8)}
            </Link>
            <span className="text-xs text-muted-foreground">{COPY.sameIpLine(day(account.createdAt), account.freeCredits)}</span>
            {account.bannedAt ? <Badge variant="destructive">{USERS_COPY.banned}</Badge> : null}
          </li>
        ))}
      </ul>
      {accounts.length >= SAME_IP_ROWS ? muted(COPY.sameIpMore(SAME_IP_ROWS)) : null}
    </Block>
  )
}

export function RequestsBlock({ requests }: { requests: UserRequest[] }) {
  return (
    <Block title={COPY.requests}>
      {requests.length === 0 ? muted(COPY.noRequests) : null}
      <ul className="grid gap-1">
        {requests.map((request) => (
          <li key={request.id} className="grid">
            <span className="truncate" title={request.description}>
              {request.description}
            </span>
            <span className="text-xs text-muted-foreground">
              {day(request.createdAt)} · {COPY.requestStatus[request.status] ?? request.status} · {COPY.votes(request.votes)}
            </span>
          </li>
        ))}
      </ul>
    </Block>
  )
}
