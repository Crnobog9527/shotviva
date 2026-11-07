import Link from 'next/link'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { EmptyState } from '../shell/admin-blocks'
import { formatBeijing } from '../shell/format'
import { accountLabel, formatAdminPhone } from '../users/label'
import type { AdminUserRow } from '../users/types'
import { USERS_COPY as COPY } from './copy'

// Plain GET form: the query lives in the URL, no client JS needed.
export function UsersSearch({ query, rows }: { query: string; rows: AdminUserRow[] | null }) {
  return (
    <div className="grid gap-4">
      <form action="/admin/users" className="flex flex-wrap items-end gap-2" role="search">
        <label className="grid min-w-0 flex-1 gap-1 text-sm">
          <span className="font-medium">{COPY.searchLabel}</span>
          <Input name="q" type="search" defaultValue={query} placeholder={COPY.searchPlaceholder} className="min-w-56" />
        </label>
        <Button type="submit">{COPY.search}</Button>
      </form>
      <p className="text-xs text-muted-foreground">{COPY.hint}</p>
      {rows === null ? <EmptyState title={COPY.prompt} /> : rows.length === 0 ? <EmptyState title={COPY.empty} /> : <UsersTable rows={rows} />}
    </div>
  )
}

const COLUMNS = ['email', 'createdAt', 'provider', 'paid', 'free', 'paidUntil', 'jobs', 'status'] as const

function UsersTable({ rows }: { rows: AdminUserRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => (
            <TableHead key={column}>{COPY.columns[column]}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/admin/users/${row.id}`} className="text-primary hover:underline">
                {accountLabel(row)}
              </Link>
              {row.email && row.phone ? <span className="block font-mono text-xs text-muted-foreground">{formatAdminPhone(row.phone)}</span> : null}
            </TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(row.createdAt) ?? COPY.never}</TableCell>
            <TableCell className="text-xs">{row.provider ?? COPY.never}</TableCell>
            <TableCell className="font-mono">{row.credits}</TableCell>
            <TableCell className="font-mono">{row.freeCredits}</TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(row.paidUntil) ?? COPY.never}</TableCell>
            <TableCell className="font-mono">{row.generationCount}</TableCell>
            <TableCell>
              <UserStatus role={row.role} bannedAt={row.bannedAt} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function UserStatus({ role, bannedAt }: { role: 'user' | 'admin'; bannedAt: string | null }) {
  if (bannedAt) return <Badge variant="destructive">{COPY.banned}</Badge>
  return <Badge variant="secondary">{role === 'admin' ? COPY.admin : COPY.normal}</Badge>
}
