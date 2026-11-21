import { COPY, STATUS } from './copy'
import { Field } from './parts'
import { categories } from './query'
export type Rate = { product_kind: string; l1_bp: number | null; l2_bp: number | null }
const percent = (bp: number | null | undefined) => (bp == null ? '' : bp / 100)
// orgL2DefaultBp: set for an enterprise account, whose level-2 column is the org's level-2 rate
// and falls back to affiliate_settings.org_l2_bp when blank (migration 1681).
export function Rates({ values = [], optional = false, orgL2DefaultBp }: { values?: Rate[]; optional?: boolean; orgL2DefaultBp?: number }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 font-medium">{optional ? COPY.overrides : COPY.currentRates}</legend>
      {orgL2DefaultBp !== undefined && <p className="text-sm text-muted-foreground">{COPY.orgL2Default(String(orgL2DefaultBp / 100))}</p>}
      {categories.map((kind) => {
        const entry = values.find((r) => r.product_kind === kind)
        return (
          <div key={kind} className="grid grid-cols-[4rem_1fr_1fr] items-end gap-2">
            <span className="self-center text-sm">{STATUS[kind]}</span>
            <Field
              label={COPY.selfRate}
              name={kind + '_l1'}
              type="number"
              min="0"
              max="100"
              step="0.01"
              required={!optional}
              defaultValue={percent(entry?.l1_bp)}
            />
            <Field
              label={orgL2DefaultBp !== undefined ? COPY.orgL2Rate : COPY.teamRate}
              name={kind + '_l2'}
              type="number"
              min="0"
              max="100"
              step="0.01"
              required={!optional}
              defaultValue={percent(entry?.l2_bp)}
            />
          </div>
        )
      })}
    </fieldset>
  )
}
