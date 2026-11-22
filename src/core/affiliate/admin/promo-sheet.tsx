import type { ReactNode } from 'react'
import { formatBeijing } from '@/core/admin/shell'
import { UserLink } from '@/core/admin/users-ui'
import { Badge } from '@/core/ui/badge'
import { Input } from '@/core/ui/input'
import { MutationForm, type SaveAction } from './form'
import { GridTable, Hidden } from './parts'
import { PROMO_COPY as P } from './promo-copy'
import type { PromoSheet } from './promo-read'
import { TOPUP_COPY as T } from './promo-topup-copy'

// One monthly grant sheet (ARCHITECTURE §6.5 渠道商推广积分): every number the grant is made of, the
// per-customer breakdown and, while it is pending and its month not over, the three decisions.

const n = (value: number) => value.toLocaleString('zh-CN')
const short = (id: string) => id.slice(0, 8)

// After the month: how much was taken back, or that it is still waiting for the daily expiry pass.
function expiryNote(s: PromoSheet, now: Date): string {
  if (s.expired_credits !== null) return ` · ${P.expired(s.expired_credits)}`
  return s.status === 'granted' && new Date(s.expires_at) <= now ? ` · ${P.expiryOverdue}` : ''
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}

function Numbers({ s, topups, now }: { s: PromoSheet; topups: number; now: Date }) {
  const d = s.detail
  const short_ = s.customers < d.min_customers
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <Row label={P.window}>{d.window_start && d.window_end ? `${formatBeijing(d.window_start)} – ${formatBeijing(d.window_end)}` : '—'}</Row>
      <Row label={P.recipient}><UserLink userId={s.recipient_user_id} className="font-mono text-xs">{short(s.recipient_user_id)}</UserLink></Row>
      <Row label={P.base}>{n(s.base)}</Row>
      <Row label={P.raw}>{n(s.raw_credits)}</Row>
      <Row label={P.cap(d.customer_cap_bp)}>{n(s.customer_cap)}{s.capped_customers > 0 && ` · ${P.capped(s.capped_customers)}`}</Row>
      <Row label={P.counted}>{n(s.counted_credits)}</Row>
      <Row label={P.customers}>{n(s.customers)}{short_ && ` · ${P.minNotMet(d.min_customers)}`}</Row>
      <Row label={P.bonus}>{n(s.bonus)} <span className="text-muted-foreground">({P.bonusRule(d.bonus_bp)})</span></Row>
      <Row label={P.clawbackOwed}>{n(s.clawback_owed)}</Row>
      <Row label={P.clawbackApplied}>{n(s.clawback_applied)}</Row>
      <Row label={P.carry}>{n(s.clawback_owed - s.clawback_applied)}</Row>
      <Row label={P.total}><strong className="text-base">{n(s.total)}</strong></Row>
      {topups > 0 && <Row label={T.sheetTopups}>{n(topups)}</Row>}
      {topups > 0 && <Row label={T.sheetMonthTotal}><strong>{n((s.status === 'granted' ? s.total : 0) + topups)}</strong></Row>}
      <Row label={P.expires}>{formatBeijing(s.expires_at)}{expiryNote(s, now)}</Row>
      <Row label={P.computedAt}>{formatBeijing(s.computed_at)}</Row>
      {s.decided_at && <Row label={P.decidedBy}>{formatBeijing(s.decided_at)}{s.decision_note && ` · ${s.decision_note}`}</Row>}
    </dl>
  )
}

function Breakdown({ s }: { s: PromoSheet }) {
  return (
    <details className="grid gap-2 text-sm">
      <summary className="cursor-pointer text-primary">{P.breakdown}（{s.detail.per.length}）</summary>
      <GridTable
        heads={[P.customer, P.rawCol, P.countedCol]}
        rows={s.detail.per.map((c) => ({
          key: c.customer,
          cells: [
            <UserLink key="u" userId={c.customer} className="font-mono text-xs">{short(c.customer)}</UserLink>,
            n(c.raw),
            c.capped ? `${n(c.counted)} · ${P.cappedMark}` : n(c.counted),
          ],
        }))}
      />
      {s.detail.sources.length > 0 && (
        <ul className="grid gap-1">
          <li className="text-muted-foreground">{P.sources}</li>
          {s.detail.sources.map((x) => <li key={x.grant_id}>{P.sourceRow(x.period, x.owed, x.applied)}</li>)}
        </ul>
      )}
    </details>
  )
}

function Decisions({ s, action }: { s: PromoSheet; action: SaveAction }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <MutationForm action={action} operation="promoDecide" label={P.confirm} confirm={P.confirmAsk(s.total)}>
        <Hidden name="grant_id" value={s.id} />
        <Hidden name="decision" value="confirm" />
        <Hidden name="fingerprint" value={s.fingerprint} />
        <p className="text-sm">{P.total}：<strong>{n(s.total)}</strong></p>
      </MutationForm>
      <MutationForm action={action} operation="promoDecide" label={P.recompute}>
        <Hidden name="grant_id" value={s.id} />
        <Hidden name="decision" value="recompute" />
      </MutationForm>
      <MutationForm action={action} operation="promoDecide" label={P.reject} destructive>
        <Hidden name="grant_id" value={s.id} />
        <Hidden name="decision" value="reject" />
        <Input name="note" required maxLength={500} aria-label={P.rejectNote} placeholder={P.rejectNote} />
      </MutationForm>
    </div>
  )
}

type CardProps = { sheet: PromoSheet; topups?: number; action: SaveAction; now: Date }

export function PromoSheetCard({ sheet: s, topups = 0, action, now }: CardProps) {
  const open = s.status === 'pending' && new Date(s.expires_at) > now
  return (
    <article className="grid gap-4 rounded-lg border p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{s.orgs?.name ?? short(s.org_id)}</h3>
        <span className="text-sm text-muted-foreground">{P.period(s.period)}</span>
        <Badge variant={s.status === 'pending' ? 'default' : 'outline'}>{P.status[s.status] ?? s.status}</Badge>
      </header>
      <Numbers s={s} topups={topups} now={now} />
      <Breakdown s={s} />
      {open && <Decisions s={s} action={action} />}
    </article>
  )
}
