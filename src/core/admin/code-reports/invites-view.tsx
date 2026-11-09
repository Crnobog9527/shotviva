import Link from 'next/link'

import type { InviteRewards } from '../../codes'
import { InviteRewardsForm, type SaveRewards } from './invite-rewards-form'
import { TableCell, TableRow } from '../../ui/table'
import type { Page } from '../cursor'
import { AdminPage, formatBeijing } from '../shell'
import { COPY } from './copy'
import { NavLink, Pager, Person, ReportTable } from './report-table'
import type { InviterRow, RedemptionRow } from './schemas'

type Props = { leaders: InviterRow[]; blocked: Page<RedemptionRow>; allTime: boolean; cursor?: string; rewards: InviteRewards; save: SaveRewards }

export function InvitesReport({ leaders, blocked, allTime, cursor, rewards, save }: Props) {
  const path = '/admin/codes/invites'
  return <AdminPage title={COPY.invites} actions={<NavLink href="/admin/codes">{COPY.list}</NavLink>}>
    <InviteRewardsForm rewards={rewards} save={save} />
    <section className="grid gap-3">
      <h2 className="font-semibold">{COPY.rank}</h2>
      <nav className="flex gap-2"><NavLink href={path} current={!allTime}>{COPY.month}</NavLink>
        <NavLink href={path + '?period=all'} current={allTime}>{COPY.allTime}</NavLink></nav>
      <ReportTable headings={[COPY.owner, COPY.joined, COPY.paid, COPY.earned]} empty={!leaders.length ? COPY.noInviters : undefined}>
        {leaders.map(row => <TableRow key={row.inviter_user_id}><TableCell><Person id={row.inviter_user_id} /></TableCell>
          <TableCell>{row.invited}</TableCell><TableCell>{row.purchasers}</TableCell><TableCell>{row.earned}</TableCell></TableRow>)}
      </ReportTable>
    </section>
    <section className="grid gap-3">
      <h2 className="font-semibold">{COPY.blocked}</h2>
      <ReportTable headings={[COPY.time, COPY.code, COPY.user, COPY.owner, COPY.how]} empty={!blocked.items.length ? COPY.noBlocked : undefined}>
        {blocked.items.map(row => <TableRow key={row.id}>
          <TableCell>{formatBeijing(row.created_at)}</TableCell>
          <TableCell>{row.code_id && row.code ? <Link className="font-mono underline" href={'/admin/codes/' + row.code_id}>{row.code}</Link> : COPY.unavailableCode}</TableCell>
          <TableCell><Person id={row.user_id} /></TableCell><TableCell><Person id={row.inviter_user_id} /></TableCell>
          <TableCell>{COPY.context[row.context]}</TableCell>
        </TableRow>)}
      </ReportTable>
      <Pager base={allTime ? path + '?period=all' : path} current={cursor} next={blocked.nextCursor} />
    </section>
  </AdminPage>
}
