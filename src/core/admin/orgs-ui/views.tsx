import Link from 'next/link'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { formatBeijing } from '../shell/format'
import { ORG_WORKS_COPY } from '../org-works/copy'
import { orgWorksHref } from '../org-works/filters'
import { ORGS_COPY as COPY } from '../orgs/copy'
import type { LedgerRow, MemberRow, OrgListItem } from '../orgs/types'
import { Card } from './fields'

const NUMBER = new Intl.NumberFormat('en-US')
export const num = (value: number) => NUMBER.format(value)
const signed = (value: number) => (value > 0 ? `+${num(value)}` : num(value))

export function OrgStatusBadge({ status }: { status: 'active' | 'suspended' }) {
  return <Badge variant={status === 'active' ? 'secondary' : 'destructive'}>{status === 'active' ? COPY.statusActive : COPY.statusSuspended}</Badge>
}

// A plain GET form: ?q= is an enterprise number (exact, any case) or part of an org's name.
export function OrgSearch({ q }: { q: string }) {
  return (
    <form method="get" action="/admin/orgs" role="search" className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{COPY.searchLabel}</span>
        <Input name="q" defaultValue={q} maxLength={120} placeholder={COPY.searchPlaceholder} autoComplete="off" className="w-72 max-w-full" />
      </label>
      <Button type="submit">{COPY.searchButton}</Button>
      {q ? <Link href="/admin/orgs" className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:underline">{COPY.searchClear}</Link> : null}
    </form>
  )
}

export function OrgTable({ orgs, searching = false }: { orgs: OrgListItem[]; searching?: boolean }) {
  if (orgs.length === 0 && searching) return <p className="text-sm text-muted-foreground">{COPY.searchNone}</p>
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
            <TableHead>{COPY.colNumber}</TableHead>
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
              <TableCell className="font-mono whitespace-nowrap select-all">{org.refCode}</TableCell>
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

// Each row links to that member's 企业作品 further down the same page.
export function MemberTable({ orgId, rows, total }: { orgId: string; rows: MemberRow[]; total: number }) {
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
              <TableHead><span className="sr-only">{ORG_WORKS_COPY.memberWorksHint}</span></TableHead>
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
                <TableCell>
                  <Link className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline" href={orgWorksHref(orgId, { member: row.userId })} title={ORG_WORKS_COPY.memberWorksHint}>
                    {ORG_WORKS_COPY.memberWorks}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
