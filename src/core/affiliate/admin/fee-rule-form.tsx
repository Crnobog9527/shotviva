import { feeKinds, feeMethods } from '../fees'
import { COPY, STATUS } from './copy'
import type { AdminFeeRule } from './fee-rules-read'
import { MutationForm, type SaveAction } from './form'
import { Field, Hidden, Select } from './parts'

const usd = (cents: number | null | undefined) => (cents == null ? '' : (cents / 100).toFixed(2))
const today = () => new Date().toISOString().slice(0, 10)

function MethodBoxes({ initial }: { initial: readonly string[] | null }) {
  return (
    <fieldset className="grid gap-2 text-sm sm:col-span-2">
      <legend className="mb-1">{COPY.feeMethods}</legend>
      <div className="flex flex-wrap gap-4">
        {feeMethods.map((method) => (
          <label key={method} className="flex items-center gap-2">
            <input type="checkbox" name="payout_methods" value={method} defaultChecked={initial?.includes(method) ?? false} />
            {STATUS[method] ?? method}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function initial(rule?: AdminFeeRule) {
  if (!rule)
    return { kind: 'percent_fixed', percent: '', fixed: '', min: '', max: '', from: today(), order: 0, active: true, methods: null }
  return {
    kind: rule.kind,
    percent: rule.percent_bp / 100,
    fixed: usd(rule.fixed_cents),
    min: usd(rule.min_cents),
    max: usd(rule.max_cents),
    from: rule.effective_from.slice(0, 10),
    order: rule.sort_order,
    active: rule.active,
    methods: rule.payout_methods,
  }
}

export function FeeRuleForm({ rule, action }: { rule?: AdminFeeRule; action: SaveAction }) {
  const v = initial(rule)
  return (
    <MutationForm action={action} operation="feeRule" label={COPY.save}>
      {rule && <Hidden name="id" value={rule.id} />}
      {rule && <Hidden name="expected_updated_at" value={rule.updated_at} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="label_zh" label={COPY.labelZh} required maxLength={80} defaultValue={rule?.label_zh} />
        <Field name="label_en" label={COPY.labelEn} required maxLength={80} defaultValue={rule?.label_en} />
        <Select name="kind" label={COPY.feeKind} values={feeKinds} labels={COPY.feeKinds} initial={v.kind} />
        <Field name="percent" label={COPY.feePercent} type="number" min="0" max="100" step="0.01"
          defaultValue={v.percent} />
        <Field name="fixed" label={COPY.feeFixed} type="number" min="0" step="0.01" defaultValue={v.fixed} />
        <Field name="min" label={COPY.feeMin} type="number" min="0" step="0.01" defaultValue={v.min} />
        <Field name="max" label={COPY.feeMax} type="number" min="0" step="0.01" defaultValue={v.max} />
        <Field name="effective_from" label={COPY.feeEffective} type="date" required
          defaultValue={v.from} />
        <Field name="sort_order" label={COPY.feeOrder} type="number" min="0" max="1000" step="1" required
          defaultValue={v.order} />
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" name="active" defaultChecked={v.active} />
          {COPY.feeActive}
        </label>
        <MethodBoxes initial={v.methods} />
      </div>
      {rule && <p className="text-sm text-muted-foreground">{COPY.feeEditHint}</p>}
    </MutationForm>
  )
}
