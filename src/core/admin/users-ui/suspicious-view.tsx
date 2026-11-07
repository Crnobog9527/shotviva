import Link from 'next/link'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { EmptyState } from '../shell/admin-blocks'
import { formatBeijing } from '../shell/format'
import { CLUSTER_WINDOWS, type ClusterWindow, type SignupCluster } from '../users/clusters'
import { accountLabel } from '../users/label'
import { BanButton } from './ban-button'
import { USERS_COPY } from './copy'
import type { UserAdminActions } from './user-actions'
import { UserStatus } from './users-search'

const COPY = USERS_COPY.suspicious
const COLUMNS = ['email', 'createdAt', 'free', 'used', 'status', 'action'] as const

type Props = { days: ClusterWindow; clusters: SignupCluster[]; ban: UserAdminActions['ban'] }

// /admin/users/suspicious: one table per IP, newest account first, ban one at a time.
export function SuspiciousView({ days, clusters, ban }: Props) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Link href="/admin/users" className="text-primary hover:underline">
          {COPY.back}
        </Link>
        {CLUSTER_WINDOWS.map((window) => (
          <Link key={window} href={`/admin/users/suspicious?days=${window}`} aria-current={window === days ? 'page' : undefined} className={window === days ? 'font-semibold' : 'text-primary hover:underline'}>
            {COPY.windows[window]}
          </Link>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{COPY.body}</p>
      {clusters.length === 0 ? <EmptyState title={COPY.empty} /> : clusters.map((cluster) => <ClusterTable key={cluster.ip} cluster={cluster} ban={ban} />)}
    </div>
  )
}

function ClusterTable({ cluster, ban }: { cluster: SignupCluster; ban: UserAdminActions['ban'] }) {
  return (
    <section className="grid gap-2">
      <h2 className="font-mono text-sm font-semibold">{COPY.ip(cluster.ip, cluster.accounts, formatBeijing(cluster.lastSignupAt) ?? '')}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableHead key={column}>{COPY.columns[column]}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {cluster.members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <Link href={`/admin/users/${member.id}`} className="text-primary hover:underline">
                  {accountLabel(member)}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(member.createdAt)}</TableCell>
              <TableCell className="font-mono">{member.freeCredits}</TableCell>
              <TableCell className="font-mono">{member.freeUsed}</TableCell>
              <TableCell>
                <UserStatus role="user" bannedAt={member.bannedAt} />
              </TableCell>
              <TableCell>{member.bannedAt ? null : <BanButton userId={member.id} ban={ban} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
