import { Badge } from '@/core/ui/badge'
import { cn } from '@/core/ui/cn'

import { formatBeijing } from '../shell/format'
import type { UserListRow } from '../users/list-types'
import { USERS_COPY as COPY } from './copy'

export function UserStatus({ role, bannedAt }: { role: 'user' | 'admin'; bannedAt: string | null }) {
  if (bannedAt) return <Badge variant="destructive">{COPY.banned}</Badge>
  return <Badge variant="secondary">{role === 'admin' ? COPY.admin : COPY.normal}</Badge>
}

// Three or more face-swap refusals within 24 hours (ARCHITECTURE §5.1a); nothing otherwise.
export function RefusalFlag({ flagged, last24h }: { flagged: boolean; last24h: number }) {
  if (!flagged) return null
  return (
    <Badge variant="destructive" title={COPY.refusalFlag(last24h)}>
      {COPY.refusalFlag(last24h)}
    </Badge>
  )
}

// The plan colours of the pricing page (globals.css tier tokens): Starter graphite, Pro sapphire,
// Max gold; free is an outline, so paying users stand out in a long list.
const TIER_STYLE: Record<UserListRow['tier'], string> = {
  free: 'border-border bg-transparent text-muted-foreground',
  starter: 'border-[var(--recess-edge)] bg-[var(--wash-strong)] text-foreground',
  pro: 'border-[var(--pass-rim-pro)] bg-[var(--pass-mark-pro)] text-[var(--tier-sapphire-ink)]',
  max: 'border-[var(--pass-rim-max)] bg-[var(--pass-mark-max)] text-[var(--tier-max-gold)]',
}

type TierProps = { tier: UserListRow['tier']; interval?: UserListRow['interval']; paidUntil?: string | null; className?: string }

// 「Pro · 年付」 with the end date under it; just 「免费」 otherwise.
export function TierBadge({ tier, interval = null, paidUntil = null, className }: TierProps) {
  const until = tier === 'free' ? null : formatBeijing(paidUntil)?.slice(0, 10)
  return (
    <span className={cn('grid justify-items-start gap-0.5', className)}>
      <Badge variant="outline" className={TIER_STYLE[tier]}>
        {COPY.tiers[tier]}
        {interval ? <span className="opacity-80">· {COPY.intervals[interval]}</span> : null}
      </Badge>
      {until ? <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{COPY.until(until)}</span> : null}
    </span>
  )
}
