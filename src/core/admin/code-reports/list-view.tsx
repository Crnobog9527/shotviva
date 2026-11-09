import Link from 'next/link'
import type { InviteConfig } from '../../codes'
import { TableCell, TableRow } from '../../ui/table'
import type { Page } from '../cursor'
import { AdminPage, formatBeijing } from '../shell'
import { COPY } from './copy'
import { effects, totals } from './format'
import { NavLink, Pager, ReportTable } from './report-table'
import type { CodeKind, CodeRow } from './schemas'
import { ToggleCode, type ToggleAction } from './toggle-code'

type Props = {
  page: Page<CodeRow>; kind: CodeKind | null; cursor?: string; invite: InviteConfig; toggle: ToggleAction
}

export function CodesList({ page, kind, cursor, invite, toggle }: Props) {
  const base = '/admin/codes'
  const filtered = kind ? base + '?kind=' + kind : base
  const actions = <><NavLink href={base + '/invites'}>{COPY.invites}</NavLink><NavLink href={base + '/new'}>{COPY.create}</NavLink></>
  return <AdminPage title={COPY.title} actions={actions}>
    <nav className="flex flex-wrap gap-2">
      <NavLink href={base} current={!kind}>{COPY.all}</NavLink>
      {(['campaign', 'invite'] as const).map(k => <NavLink key={k} href={base + '?kind=' + k} current={kind === k}>{COPY.kind[k]}</NavLink>)}
    </nav>
    <ReportTable headings={[COPY.code, COPY.type, COPY.effect, COPY.limit, COPY.expires, COPY.paid, COPY.net, COPY.totalDiscount, COPY.status]}
      empty={!page.items.length ? COPY.empty : undefined}>
      {page.items.map(row => <TableRow key={row.id}>
        <TableCell><Link className="font-mono font-medium underline underline-offset-2" href={base + '/' + row.id}>{row.code}</Link></TableCell>
        <TableCell>{COPY.kind[row.kind]}</TableCell>
        <TableCell className="max-w-72 whitespace-normal">{effects(row, invite).join(' · ')}</TableCell>
        <TableCell>{row.redemption_count} / {row.max_redemptions ?? COPY.noLimit}</TableCell>
        <TableCell>{formatBeijing(row.expires_at) ?? COPY.noExpiry}</TableCell>
        <TableCell>{row.purchasers}</TableCell>
        <TableCell>{totals(row.amounts, 'net')}</TableCell><TableCell>{totals(row.amounts, 'discount')}</TableCell>
        <TableCell><ToggleCode id={row.id} code={row.code} active={row.active} action={toggle} /></TableCell>
      </TableRow>)}
    </ReportTable>
    {page.items.length > 0 && <p className="text-xs text-muted-foreground">{COPY.disableNote}</p>}
    <Pager base={filtered} current={cursor} next={page.nextCursor} />
  </AdminPage>
}
