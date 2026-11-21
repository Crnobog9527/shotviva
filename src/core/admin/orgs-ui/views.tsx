import Link from 'next/link'

import { Badge } from '@/core/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { formatBeijing } from '../shell/format'
import { ORGS_COPY as COPY } from '../orgs/copy'
import type { LedgerRow, MemberRow, OrgListItem } from '../orgs/types'
import { Card } from './fields'

const NUMBER = new Intl.NumberFormat('en-US')
export const num = (value: number) => NUMBER.format(value)
const signed = (value: number) => (value > 0 ? `+${num(value)}` : num(value))

export function OrgStatusBadge({ status }: { status: 'active' | 'suspended' }) {
  return <Badge variant={status === 'active' ? 'secondary' : 'destructive'}>{status === 'active' ? COPY.statusActive : COPY.statusSuspended}</Badge>
}

export function OrgTable({ orgs }: { orgs: OrgListItem[] }) {
  if (orgs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
        <p className="font-medium">{COPY.empty}</p>
        <p className="mt-2 text-sm text-muted-foreground">{COPY.emptyHint}</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{COPY.colName}</TableHead>
            <TableHead>{COPY.colOwner}</TableHead>
            <TableHead>{COPY.colStatus}</TableHead>
            <TableHead className="text-right">{COPY.colPool}</TableHead>
            <TableHead className="text-right">{COPY.colMembers}</TableHead>
            <TableHead>{COPY.colCreated}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orgs.map((org) => (
            <TableRow key={org.id}>
              <TableCell className="min-w-40 font-medium">
                <Link className="underline-offset-4 hover:underline" href={`/admin/orgs/${org.id}`}>{org.name}</Link>
              </TableCell>
              <TableCell className="[overflow-wrap:anywhere]">{org.ownerAccount ?? '—'}</TableCell>
              <TableCell><OrgStatusBadge status={org.status} /></TableCell>
              <TableCell className="text-right font-mono tabular-nums">{num(org.poolCredits)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{org.memberCount}</TableCell>
              <TableCell className="whitespace-nowrap">{formatBeijing(org.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

const LEDGER_LIMIT = 100

export function LedgerTable({ rows }: { rows: LedgerRow[] }) {
  return (
    <Card title={COPY.ledgerTitle} hint={rows.length >= LEDGER_LIMIT ? COPY.ledgerLimit(LEDGER_LIMIT) : undefined}>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{COPY.ledgerEmpty}</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{COPY.colTime}</TableHead>
              <TableHead>{COPY.colKind}</TableHead>
              <TableHead className="text-right">{COPY.colDelta}</TableHead>
              <TableHead className="text-right">{COPY.colAfter}</TableHead>
              <TableHead>{COPY.colRef}</TableHead>
              <TableHead className="text-right">{COPY.colCny}</TableHead>
              <TableHead>{COPY.colMember}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">{formatBeijing(row.createdAt)}</TableCell>
                <TableCell className="whitespace-nowrap">{COPY.kinds[row.kind] ?? row.kind}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{signed(row.delta)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{num(row.poolAfter)}</TableCell>
                <TableCell className="min-w-32 [overflow-wrap:anywhere]">
                  {[row.packageName, row.reference, row.note].filter(Boolean).join(' · ') || '—'}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {row.amountCnyFen === null ? '—' : `¥${(row.amountCnyFen / 100).toFixed(2)}`}
                </TableCell>
                <TableCell className="[overflow-wrap:anywhere]">{row.memberAccount ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

export function MemberTable({ rows, total }: { rows: MemberRow[]; total: number }) {
  return (
    <Card title={COPY.membersTitle} hint={total > rows.length ? COPY.membersLimit(rows.length, total) : undefined}>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{COPY.membersEmpty}</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{COPY.colAccount}</TableHead>
              <TableHead>{COPY.colRole}</TableHead>
              <TableHead className="text-right">{COPY.colAllowance}</TableHead>
              <TableHead className="text-right">{COPY.colHeld}</TableHead>
              <TableHead>{COPY.colJoined}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.userId} className={row.status === 'removed' ? 'text-muted-foreground' : undefined}>
                <TableCell className="min-w-40 [overflow-wrap:anywhere]">
                  <Link className="underline-offset-4 hover:underline" href={`/admin/users?user=${row.userId}`}>{row.account ?? row.userId}</Link>
                </TableCell>
                <TableCell>
                  {row.role === 'owner' ? COPY.roleOwner : COPY.roleMember}
                  {row.status === 'removed' ? ` · ${COPY.memberRemoved}` : ''}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{num(row.monthlyAllowance)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{num(row.heldCredits)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatBeijing(row.joinedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
