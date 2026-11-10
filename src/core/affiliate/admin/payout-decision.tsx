import { COPY, money } from './copy'
import { MutationForm, type SaveAction } from './form'
import { Field, Hidden } from './parts'
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

function DuePayout({ r, action }: Props) {
  return (
    <>
      {!r.legacy_review_required && (r.payable === null ? <p>{COPY.missingPayable}</p> : (
        <MutationForm action={action} operation="paid" label={COPY.payCurrent + ' · ' + money(r.payable)}>
          <Hidden name="payout_id" value={r.id} />
          <Hidden name="expected_amount" value={String(r.payable)} />
          <Field name="paid_at" label={COPY.paidAt} type="date" required />
          <Field name="method" label={COPY.actualMethod} required maxLength={120} />
          <Field name="paid_reference" label={COPY.reference} maxLength={250} />
          <Field name="note" label={COPY.note} maxLength={2000} />
          <p className="text-sm">{COPY.referenceOrNote}</p>
        </MutationForm>
      ))}
      <MutationForm action={action} operation="hold" label={COPY.hold}>
        <Hidden name="payout_id" value={r.id} />
        <Field label={COPY.reason} name="note" required maxLength={2000} />
      </MutationForm>
    </>
  )
}
export function DecidePayout({ r, action }: Props) {
  if (r.status !== 'due' && r.status !== 'held')
    return <span>{[r.paid_at?.slice(0, 10), r.paid_method, r.paid_reference, r.note].filter(Boolean).join(' · ')}</span>
  return (
    <div>
      {r.legacy_review_required && <p className="mb-2 text-sm font-medium">{COPY.legacyPayoutReview}</p>}
      <details>
        <summary className="cursor-pointer">{COPY.complete}</summary>
        {r.status === 'held' ? <HeldPayout r={r} action={action} /> : <DuePayout r={r} action={action} />}
      </details>
    </div>
  )
}
