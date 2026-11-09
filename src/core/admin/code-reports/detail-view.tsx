import type { InviteConfig } from '../../codes'
import { TableCell, TableRow } from '../../ui/table'
import type { Page } from '../cursor'
import { ORDERS_COPY } from '../orders'
import { AdminPage, StatCard, formatBeijing } from '../shell'
import { COPY } from './copy'
import { discountState, effects, totals } from './format'
import { NavLink, Pager, Person, ReportTable } from './report-table'
import type { CodeRow, RedemptionRow } from './schemas'
import { ToggleCode, type ToggleAction } from './toggle-code'

function Redemption({ row, hasDiscount, now }: { row: RedemptionRow; hasDiscount: boolean; now: number }) {
  return <TableRow>
    <TableCell>{formatBeijing(row.created_at)}</TableCell><TableCell><Person id={row.user_id} /></TableCell>
    <TableCell>{COPY.context[row.context]}</TableCell><TableCell>{COPY.outcome[row.status]}</TableCell>
    <TableCell>{row.credits_granted}</TableCell>
    <TableCell>{discountState(row, hasDiscount, now)}
      {row.discount_conflict_payments.length > 0 && <p className="text-destructive">
        {COPY.conflict} · {row.discount_conflict_payments.map(COPY.payment).join('、')}
      </p>}
    </TableCell>
    <TableCell>{row.inviter_reward_payment_id ? <>
      {COPY.payment(row.inviter_reward_payment_id)} · {row.reward_payment_status && ORDERS_COPY.statuses[row.reward_payment_status]}
      {row.reward_payment_refunded && row.reward_payment_status === 'disputed' ? ' · ' + COPY.refundRecorded : null}
    </> : COPY.blank}</TableCell>
  </TableRow>
}

type Props = { code: CodeRow; page: Page<RedemptionRow>; cursor?: string; invite: InviteConfig; toggle: ToggleAction; now: number }

export function CodeDetail({ code, page, invite, cursor, toggle, now }: Props) {
  const path = '/admin/codes/' + code.id
  const actions = <><NavLink href="/admin/codes">{COPY.list}</NavLink>
    {code.kind === 'campaign' && <NavLink href={path + '/edit'}>{COPY.edit}</NavLink>}</>
  return <AdminPage title={code.code} actions={actions}>
    <section className="grid gap-3 rounded-lg border bg-card p-4">
      <p>{COPY.kind[code.kind]} · {effects(code, invite).join(' · ')}</p>
      <p className="text-sm text-muted-foreground">{COPY.limit}　{code.redemption_count} / {code.max_redemptions ?? COPY.noLimit}
       　 · {COPY.expires}　{formatBeijing(code.expires_at) ?? COPY.noExpiry}{code.new_users_only && ' · ' + COPY.limited}</p>
      {code.owner_user_id && <p>{COPY.owner}　<Person id={code.owner_user_id} /></p>}
      {code.note && <p className="break-words text-sm">{COPY.note}　{code.note}</p>}
      <ToggleCode id={code.id} code={code.code} active={code.active} action={toggle} />
      <p className="text-xs text-muted-foreground">{COPY.disableNote}</p>
    </section>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard title={COPY.redeemed} value={String(code.redemption_count)} /><StatCard title={COPY.paid} value={String(code.purchasers)} />
      <StatCard title={COPY.net} value={totals(code.amounts, 'net')} /><StatCard title={COPY.totalDiscount} value={totals(code.amounts, 'discount')} />
    </div>
    <section className="grid gap-3">
      <h2 className="font-semibold">{COPY.redemptions}</h2>
      <ReportTable headings={[COPY.time, COPY.user, COPY.how, COPY.status, COPY.granted, COPY.discount, COPY.reward]}
        empty={!page.items.length ? COPY.noRedemptions : undefined}>
        {page.items.map(row => <Redemption key={row.id} row={row} hasDiscount={code.discount_percent !== null} now={now} />)}
      </ReportTable>
      <Pager base={path} current={cursor} next={page.nextCursor} />
    </section>
  </AdminPage>
}
