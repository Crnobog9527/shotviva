import type { SupabaseClient } from '@supabase/supabase-js'
import { FEE_COPY as F } from './payment-fees-copy'
import { paymentFeeSchedules, type Schedule } from './payment-fees-read'
import { COPY } from './copy'
import { MutationForm, type SaveAction } from './form'
import { Field, GridTable, Hidden, Section, Select } from './parts'

const rateLabel = (bp: number, fixed: number) =>
  [bp ? bp / 100 + '%' : null, fixed ? '$' + (fixed / 100).toFixed(2) : null].filter(Boolean).join(' + ') || '—'

function EditForm({ row, action }: { row: Schedule; action: SaveAction }) {
  return (
    <MutationForm action={action} operation="feeSchedule" label={COPY.save}>
      <Hidden name="id" value={row.id} />
      <Hidden name="expected_updated_at" value={row.updated_at} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={row.active} />
        {F.active}
      </label>
      <Field name="note" label={F.note} maxLength={500} defaultValue={row.note ?? ''} />
    </MutationForm>
  )
}

function AddForm({ action }: { action: SaveAction }) {
  return (
    <MutationForm action={action} operation="feeSchedule" label={COPY.save}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select name="channel" label={F.channel} values={Object.keys(F.channels)} labels={F.channels} initial="waffo" />
        <Select name="method" label={F.method} values={Object.keys(F.methods)} labels={F.methods} initial="card" />
        <Select name="kind" label={F.kind} values={Object.keys(F.kinds)} labels={F.kinds} initial="acquiring" />
        <Select name="rounding" label={F.rounding} values={Object.keys(F.roundingLabels)} labels={F.roundingLabels} initial="half_up" />
        <Field name="percent" label={F.rateBp} type="number" min="0" max="100" step="0.01" defaultValue="0" />
        <Field name="fixed" label={F.fixed} type="number" min="0" step="0.01" defaultValue="0" />
        <Field name="effective_from" label={F.effective} type="datetime-local" required />
        <Field name="note" label={F.note} maxLength={500} />
      </div>
    </MutationForm>
  )
}

export async function PaymentFeeSchedules({ db, action }: { db: SupabaseClient; action: SaveAction }) {
  const rows = await paymentFeeSchedules(db)
  return (
    <Section title={F.schedules}>
      <p className="text-sm text-muted-foreground">{F.schedulesHint}</p>
      <GridTable
        heads={[F.channel, F.method, F.kind, F.rate, F.rounding, F.effective, COPY.status, F.note, F.edit]}
        rows={rows.map((r) => ({
          key: r.id,
          cells: [
            F.channels[r.channel] ?? r.channel, F.methods[r.method] ?? r.method, F.kinds[r.kind] ?? r.kind,
            rateLabel(r.rate_bp, r.fixed_cents), F.roundingLabels[r.rounding] ?? r.rounding,
            r.effective_from.slice(0, 16).replace('T', ' '), r.active ? F.active : F.inactive, r.note ?? '—',
            <details key="edit"><summary className="cursor-pointer">{F.edit}</summary><EditForm row={r} action={action} /></details>,
          ],
        }))}
      />
      <details>
        <summary className="cursor-pointer text-sm font-medium">{F.addSchedule}</summary>
        <AddForm action={action} />
      </details>
    </Section>
  )
}
