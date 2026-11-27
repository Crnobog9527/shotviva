import Link from 'next/link'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { formatBeijing } from '../shell/format'
import { bonusLabel, CUSTOMER_COPY as COPY, sourceLabel } from '../orgs/customer-copy'
import { orgDetailTabHref } from '../orgs/detail-tabs'
import type { OrgCustomer, OrgCustomerPage } from '../orgs/types'
import { Card } from './fields'
import { num } from './views'

const usd = (cents: number) => (cents === 0 ? '—' : `$${(cents / 100).toFixed(2)}`)
const userHref = (id: string) => `/admin/users?user=${id}`
const LINK = 'inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline'

export function customerPageHref(orgId: string, page: number) {
  const base = orgDetailTabHref(orgId, 'promo')
  return page > 1 ? `${base}&page=${page}` : base
}

function From({ row }: { row: OrgCustomer }) {
  return (
    <div className="grid gap-0.5">
      <span>{sourceLabel(row.source)}</span>
      {row.memberUserId ? (
        <Link className="text-xs text-muted-foreground underline-offset-4 hover:underline [overflow-wrap:anywhere]" href={userHref(row.memberUserId)}>
          {row.memberContact ?? row.memberUserId.slice(0, 8)}
        </Link>
      ) : null}
      {row.viaUserId ? (
        <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {COPY.via} <Link className="underline-offset-4 hover:underline" href={userHref(row.viaUserId)}>{row.viaContact ?? row.viaUserId.slice(0, 8)}</Link>
        </span>
      ) : null}
    </div>
  )
}

// 推广名单: every account bound to the org's affiliate account, one server page at a time.
export function CustomerTable({ orgId, data, hasAccount }: { orgId: string; data: OrgCustomerPage; hasAccount: boolean }) {
  const { rows, total, page, pageSize } = data
  const from = (page - 1) * pageSize + 1
  const to = from + rows.length - 1
  return (
    <Card title={COPY.title} hint={COPY.hint}>
      {!hasAccount ? <p className="text-sm text-muted-foreground">{COPY.noAccount}</p> : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {COPY.empty}
          {page > 1 ? <> <Link className={LINK} href={customerPageHref(orgId, 1)}>{COPY.first}</Link></> : null}
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{COPY.colAccount}</TableHead>
                <TableHead>{COPY.colLevel}</TableHead>
                <TableHead>{COPY.colFrom}</TableHead>
                <TableHead>{COPY.colSignedUp}</TableHead>
                <TableHead>{COPY.colBonus}</TableHead>
                <TableHead className="text-right">{COPY.colPaid}</TableHead>
                <TableHead className="text-right">{COPY.colCommission}</TableHead>
                <TableHead className="text-right">{COPY.colPromo}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell className="min-w-40 [overflow-wrap:anywhere]">
                    <Link className="underline-offset-4 hover:underline" href={userHref(row.userId)}>{row.contact ?? row.userId}</Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{COPY.level(row.level)}</TableCell>
                  <TableCell className="min-w-36"><From row={row} /></TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div>{formatBeijing(row.signedUpAt)}</div>
                    {row.referredAt && formatBeijing(row.referredAt) !== formatBeijing(row.signedUpAt) ? (
                      <div className="text-xs text-muted-foreground">{COPY.bindAt} {formatBeijing(row.referredAt)}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className={row.bonus.kind === 'granted' ? 'min-w-28' : 'max-w-64 min-w-44 whitespace-normal text-muted-foreground'}>{bonusLabel(row.bonus)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{usd(row.paidCents)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{usd(row.commissionCents)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{row.promoCredits ? num(row.promoCredits) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <nav className="flex flex-wrap items-center gap-4 text-sm" aria-label={COPY.pagesLabel}>
            <span className="text-muted-foreground">{COPY.pageInfo(from, to, total)}</span>
            {page > 1 ? <Link className={LINK} href={customerPageHref(orgId, page - 1)}>{COPY.prev}</Link> : null}
            {to < total ? <Link className={LINK} href={customerPageHref(orgId, page + 1)}>{COPY.next}</Link> : null}
          </nav>
        </>
      )}
    </Card>
  )
}
