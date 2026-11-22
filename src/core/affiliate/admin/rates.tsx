import { COPY, STATUS } from './copy'
import { Field } from './parts'
import { categories } from './query'
export type Rate = { product_kind: string; l1_bp: number | null; l2_bp: number | null; org_l2_bp?: number | null }
// Enterprise level-2 defaults per product kind (affiliate_rates.org_l2_bp, migration 1900).
export type OrgL2Defaults = Partial<Record<(typeof categories)[number], number>>
const percent = (bp: number | null | undefined) => (bp == null ? '' : bp / 100)
const rateField = { type: 'number', min: '0', max: '100', step: '0.01' } as const

// orgL2Defaults: set for an enterprise account, whose level-2 column is the org's level-2 rate and
// falls back to that kind's enterprise default when blank. editOrgL2: the settings form, which also
// edits those defaults.
export function Rates({ values = [], optional = false, orgL2Defaults, editOrgL2 = false }: {
  values?: Rate[]
  optional?: boolean
  orgL2Defaults?: OrgL2Defaults
  editOrgL2?: boolean
}) {
  const org = orgL2Defaults !== undefined
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 font-medium">{optional ? COPY.overrides : COPY.currentRates}</legend>
      {org && <p className="text-sm text-muted-foreground">{COPY.orgL2Default(defaultsText(orgL2Defaults))}</p>}
      {categories.map((kind) => {
        const entry = values.find((r) => r.product_kind === kind)
        const fallback = orgL2Defaults?.[kind]
        return (
          <div key={kind} className={(editOrgL2 ? 'grid-cols-[4rem_repeat(3,minmax(0,1fr))]' : 'grid-cols-[4rem_1fr_1fr]') + ' grid items-end gap-2'}>
            <span className="self-center text-sm">{STATUS[kind]}</span>
            <Field label={COPY.selfRate} name={kind + '_l1'} {...rateField} required={!optional} defaultValue={percent(entry?.l1_bp)} />
            <Field
              label={org ? COPY.orgL2Rate : COPY.teamRate}
              name={kind + '_l2'}
              {...rateField}
              required={!optional}
              placeholder={fallback === undefined ? undefined : COPY.orgL2Placeholder(String(fallback / 100))}
              defaultValue={percent(entry?.l2_bp)}
            />
            {editOrgL2 && (
              <Field label={COPY.orgL2DefaultRate} name={kind + '_org_l2'} {...rateField} required defaultValue={percent(entry?.org_l2_bp)} />
            )}
          </div>
        )
      })}
    </fieldset>
  )
}
function defaultsText(defaults: OrgL2Defaults) {
  return categories
    .filter((kind) => defaults[kind] !== undefined)
    .map((kind) => `${STATUS[kind]} ${(defaults[kind] ?? 0) / 100}%`)
    .join('、')
}
