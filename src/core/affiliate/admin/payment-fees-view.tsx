import { formatBeijing } from '@/core/admin/shell'
import { COPY, money } from './copy'
import { FEE_COPY as F } from './payment-fees-copy'
import { feeOverview, paymentFees, type PaymentLine } from './payment-fees-read'
import { PaymentFeeSchedules } from './payment-fee-schedules'
import { PaymentFeesStart } from './payment-fees-start-view'
import type { ViewProps } from './members-view'
import { Field, FiltersForm, GridTable, LinkTo, Section } from './parts'

const rateLabel = (bp: number | null, fixed: number | null) =>
  [bp ? bp / 100 + '%' : null, fixed ? money(fixed) : null].filter(Boolean).join(' + ') || '—'

const scopeOf = (l: PaymentLine) => l.refund_id ?? ''
function latestRevisions(lines: PaymentLine[]) {
  const latest = new Map<string, number>()
  for (const l of lines) latest.set(scopeOf(l), Math.max(latest.get(scopeOf(l)) ?? 0, l.revision))
  return latest
}

function Lines({ lines }: { lines: PaymentLine[] }) {
  const latest = latestRevisions(lines)
  return (
    <GridTable
      heads={[F.scope, F.revision, F.kind, F.rate, F.amount, F.source, F.state, F.ref, COPY.note]}
      rows={lines.map((l) => ({
        key: l.id,
        cells: [
          l.refund_id ? F.refundScope + l.refund_id : F.charge,
          <span key="r">{l.revision}{l.revision === latest.get(scopeOf(l)) ? ' · ' + F.current : ' · ' + F.replaced}</span>,
          F.kinds[l.kind] ?? l.kind,
          rateLabel(l.rate_bp, l.fixed_cents),
          money(l.amount_cents),
          F.sources[l.source] ?? l.source,
          F.states[l.status] ?? l.status,
          l.source_ref ?? '—',
          l.note ?? '—',
        ],
      }))}
    />
  )
}

async function Detail({ db, id }: { db: ViewProps['db']; id: string }) {
  const found = await paymentFees(db, id)
  if (!found) return <p className="text-sm text-muted-foreground">{F.notFound}</p>
  const { payment: p, lines, commissions } = found
  return (
    <div className="grid gap-4">
      <GridTable
        heads={[F.payment, COPY.date, F.channel, F.method, COPY.product, F.paid, F.tax, F.refunded, F.feeStatus, F.feeTotal]}
        rows={[{
          key: p.id,
          cells: [
            p.id, formatBeijing(p.created_at), F.channels[p.channel] ?? p.channel, F.methods[p.method] ?? p.method, p.product_id,
            money(p.amount_total), money(p.amount_tax), money(p.amount_refunded),
            p.fee_status ? F.feeStatuses[p.fee_status] : F.none, p.fee_cents === null ? '—' : money(p.fee_cents),
          ],
        }]}
      />
      {lines.length ? <Lines lines={lines} /> : <p className="text-sm text-muted-foreground">{F.noLines}</p>}
      <h3 className="font-semibold">{F.commissionsOfPayment}</h3>
      <GridTable
        heads={['ID', F.level, COPY.pct, F.fees, F.netBase, COPY.commission, COPY.status]}
        rows={commissions.map((c) => ({
          key: c.id,
          cells: [c.id, c.level === 2 ? COPY.teamBonus : COPY.selfCommission, c.rate_bp / 100 + '%',
            c.fee_cents === null ? F.none : money(c.fee_cents), c.net_base_usd === null ? '—' : money(c.net_base_usd),
            money(c.amount), c.status],
        }))}
      />
    </div>
  )
}

async function Overview({ db }: { db: ViewProps['db'] }) {
  const o = await feeOverview(db)
  return (
    <Section title={F.reconTitle}>
      <p className="text-sm text-muted-foreground">{F.reconHint}</p>
      {o.recordFrom === null ? (
        <p className="text-sm">{F.reconOff}</p>
      ) : (
        <>
          <p className="text-sm">{F.recordFrom}：{o.recordFrom.slice(0, 19).replace('T', ' ')}</p>
          <GridTable
            heads={[F.countMissing, F.countEstimated, F.countFinal]}
            rows={[{ key: 'counts', cells: [o.missing, o.estimated, o.final] }]}
          />
        </>
      )}
      <h3 className="font-semibold">{F.last31}</h3>
      <GridTable
        heads={[F.channel, F.method, F.payments, F.total]}
        rows={o.totals.map((r) => ({
          key: r.channel + r.method,
          cells: [F.channels[r.channel] ?? r.channel, F.methods[r.method] ?? r.method, r.payments, money(r.cents)],
        }))}
      />
    </Section>
  )
}

export async function FeesView({ db, filters, action, latestTerms }: ViewProps) {
  return (
    <>
      {latestTerms && <PaymentFeesStart db={db} action={action} latestTerms={latestTerms} />}
      <Section title={F.lookupTitle}>
        <p className="text-sm text-muted-foreground">{F.lookupHint}</p>
        <FiltersForm tab="fees">
          <Field name="payment" label={F.paymentId} defaultValue={filters.payment} inputMode="numeric" pattern="[1-9][0-9]*" />
        </FiltersForm>
        {filters.payment && <Detail db={db} id={filters.payment} />}
      </Section>
      <Overview db={db} />
      <PaymentFeeSchedules db={db} action={action} />
    </>
  )
}

export function PaymentLink({ id }: { id: string | number }) {
  return <LinkTo filters={{ tab: 'fees', payment: String(id) }}>{id}</LinkTo>
}
