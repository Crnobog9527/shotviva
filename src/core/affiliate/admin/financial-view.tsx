import { COPY, STATUS, money, commissionStatus } from './copy'
import { MutationForm, type SaveAction } from './form'
import { payoutAmountHeaders, payoutAmounts } from './payout-amounts'
import { DecidePayout } from './payout-decision'
import type { ViewProps } from './members-view'
import { Field, FiltersForm, GridTable, LinkTo, NextPage, Hidden, Select } from './parts'
import { href, type Filters } from './query'
import { commissions, payouts, type Commission, type Payout } from './read'

const cStatus = { ...STATUS, pending: commissionStatus('pending') }
function FilterBar({ f }: { f: Filters }) {
  const payout = f.tab === 'payouts'
  return (
    <>
      <FiltersForm tab={f.tab}>
        <Field label={COPY.affiliateId} name="affiliate" defaultValue={f.affiliate} />
        <Select
          name="status"
          label={COPY.status}
          initial={f.status}
          labels={cStatus}
          all
          values={payout ? ['due', 'paid', 'held', 'void'] : ['pending', 'confirmed', 'on_hold', 'void']}
        />
        <Field name="from" label={COPY.from} type="date" defaultValue={f.from} />
        <Field name="until" label={COPY.until} type="date" defaultValue={f.until} />
        {payout ? (
          <Field name="period" label={COPY.period} type="date" defaultValue={f.period} />
        ) : (
          <Select
            name="flag"
            label={COPY.flag}
            initial={f.flag}
            all
            values={['yes', 'no']}
            labels={{ yes: COPY.flaggedOnly, no: COPY.unflagged }}
          />
        )}
      </FiltersForm>
      <a className="text-sm text-primary underline" href={href({ ...f, cursor: undefined }, '/api/admin/affiliates/export')}>
        {COPY.csv}
      </a>
    </>
  )
}
function ReviewCommission({ r, action }: { r: Commission; action: SaveAction }) {
  if (r.status === 'void') return null
  return (
    <details>
      <summary className="cursor-pointer">{COPY.complete}</summary>
      <MutationForm action={action} operation="release" label={COPY.save}>
        <Hidden name="commission_id" value={r.id} />
        <Select
          name="decision"
          label={COPY.complete}
          values={r.flags.length && !r.released_by ? ['release', 'void'] : ['void']}
          labels={{ release: COPY.release, void: COPY.void }}
        />
        <Field name="reason" label={COPY.reason} required maxLength={2000} />
      </MutationForm>
    </details>
  )
}
export async function CommissionsView({ db, filters, action }: ViewProps) {
  const list = await commissions(db, filters)
  return (
    <>
      <FilterBar f={filters} />
      <GridTable
        heads={[
          COPY.payment,
          COPY.date,
          COPY.affiliateId,
          COPY.product,
          COPY.type,
          COPY.amountBeforeTax,
          COPY.pct,
          COPY.commission,
          COPY.status,
          COPY.flag,
          COPY.complete,
        ]}
        rows={list.items.map((r) => ({
          key: r.id,
          cells: [
            r.payment_id,
            r.created_at.slice(0, 10),
            <LinkTo key="member" filters={{ tab: 'affiliates', id: r.affiliate_user_id }}>
              {r.affiliate_user_id}
            </LinkTo>,
            r.product_id,
            r.level === 2 ? COPY.teamBonus : COPY.selfCommission,
            money(r.base_usd),
            r.rate_bp / 100 + '%',
            money(r.amount),
            commissionStatus(r.status),
            r.flags.map((s) => STATUS[s] ?? s).join('、') || COPY.none,
            <ReviewCommission key="form" r={r} action={action} />,
          ],
        }))}
      />
      <NextPage filters={filters} cursor={list.nextCursor} />
    </>
  )
}
export function snapshotText(r: Payout) {
  const method = String(r.payout_snapshot.payout_method ?? '')
  return [STATUS[method] ?? method, r.payout_snapshot.payout_details].filter(Boolean).join(' · ')
}
function Flags({ r }: { r: Payout }) {
  const list = r.owner?.risks ?? []
  if (!list.length) return COPY.flagsEmpty
  return (
    <>
      <ul>
        {list.map((c) => (
          <li key={c.id}>
            #{c.id} · {c.flags.map((s) => STATUS[s] ?? s).join('、')}
          </li>
        ))}
      </ul>
      <LinkTo filters={{ tab: 'commissions', affiliate: r.affiliate_user_id, flag: 'yes' }}>{COPY.memberFlagged}</LinkTo>
    </>
  )
}
export async function PayoutsView({ db, filters, action }: ViewProps) {
  const list = await payouts(db, filters, true)
  return (
    <>
      <FilterBar f={filters} />
      <GridTable
        heads={[COPY.period, COPY.affiliateId, ...payoutAmountHeaders, COPY.status, COPY.payoutSnapshot, COPY.flag, COPY.complete]}
        rows={list.items.map((r) => ({
          key: r.id,
          cells: [
            r.period,
            <LinkTo key="member" filters={{ tab: 'affiliates', id: r.affiliate_user_id }}>
              {r.affiliate_user_id}
            </LinkTo>,
            ...payoutAmounts(r, money, '—'),
            STATUS[r.status],
            snapshotText(r),
            <Flags key="risk" r={r} />,
            <DecidePayout key="form" r={r} action={action} />,
          ],
        }))}
      />
      <NextPage filters={filters} cursor={list.nextCursor} />
    </>
  )
}
