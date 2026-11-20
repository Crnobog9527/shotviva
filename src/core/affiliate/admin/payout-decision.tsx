import { COPY, money } from './copy'
import { MutationForm, type SaveAction } from './form'
import { Field, Hidden } from './parts'
import { feeLineTexts } from './payout-amounts'
import type { Payout } from './read'

type Props = { r: Payout; action: SaveAction }

function HeldPayout({ r, action }: Props) {
  return (
    <>
      {r.note && <p>{r.note}</p>}
      <MutationForm action={action} operation="resumePayout" label={COPY.resumePayout}>
        <Hidden name="payout_id" value={r.id} />
      </MutationForm>
      <MutationForm action={action} operation="voidPayout" label={COPY.voidPayout} destructive>
        <Hidden name="payout_id" value={r.id} />
        <fieldset className="grid gap-2">
          <legend>{COPY.voidMode}</legend>
          <label><input type="radio" name="void_mode" value="return" required /> {COPY.returnCommission}</label>
          {!r.legacy_review_required && <label><input type="radio" name="void_mode" value="forfeit" required /> {COPY.forfeitCommission}</label>}
        </fieldset>
        <Field name="note" label={COPY.reason} required maxLength={2000} />
      </MutationForm>
    </>
  )
}

function FeeBreakdown({ r }: { r: Payout }) {
  if (!r.fees) return null
  const lines = feeLineTexts(r, money)
  return (
    <div className="mb-2 grid gap-1 text-sm">
      {lines.length ? <ul>{lines.map((line, i) => <li key={i}>{line}</li>)}</ul> : <p>{COPY.noFees}</p>}
      {lines.length > 0 && <p className="font-medium">{COPY.netAmount + ' ' + money(r.fees.net)}</p>}
    </div>
  )
}

function PayForm({ r, action }: Props) {
  if (r.payable === null || !r.fees) return <p>{COPY.missingPayable}</p>
  if (r.fees.fees > 0 && r.fees.net === 0) return <p>{COPY.netZero}</p>
  return (
    <MutationForm action={action} operation="paid" label={COPY.payNet + ' · ' + money(r.fees.net)}>
      <Hidden name="payout_id" value={r.id} />
      <Hidden name="expected_amount" value={String(r.payable)} />
      <Hidden name="expected_net" value={String(r.fees.net)} />
      <Field name="paid_at" label={COPY.paidAt} type="date" required />
      <Field name="method" label={COPY.actualMethod} required maxLength={120} />
      <Field name="paid_reference" label={COPY.reference} maxLength={250} />
      <Field name="note" label={COPY.note} maxLength={2000} />
      <p className="text-sm">{COPY.referenceOrNote}</p>
    </MutationForm>
  )
}

function DuePayout({ r, action }: Props) {
  return (
    <>
      {!r.legacy_review_required && <PayForm r={r} action={action} />}
      <MutationForm action={action} operation="hold" label={COPY.hold}>
        <Hidden name="payout_id" value={r.id} />
        <Field label={COPY.reason} name="note" required maxLength={2000} />
      </MutationForm>
    </>
  )
}
export function DecidePayout({ r, action }: Props) {
  if (r.status !== 'due' && r.status !== 'held')
    return (
      <div>
        {r.status === 'paid' && <FeeBreakdown r={r} />}
        <span>{[r.paid_at?.slice(0, 10), r.paid_method, r.paid_reference, r.note].filter(Boolean).join(' · ')}</span>
      </div>
    )
  return (
    <div>
      {r.legacy_review_required && <p className="mb-2 text-sm font-medium">{COPY.legacyPayoutReview}</p>}
      <FeeBreakdown r={r} />
      <details>
        <summary className="cursor-pointer">{COPY.complete}</summary>
        {r.status === 'held' ? <HeldPayout r={r} action={action} /> : <DuePayout r={r} action={action} />}
      </details>
    </div>
  )
}
