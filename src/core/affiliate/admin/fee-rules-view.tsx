import type { SupabaseClient } from '@supabase/supabase-js'
import { feeFormula } from '../fees'
import { COPY, STATUS, money } from './copy'
import { FeeRuleForm } from './fee-rule-form'
import { feeRules, type AdminFeeRule } from './fee-rules-read'
import type { SaveAction } from './form'
import { GridTable, Section } from './parts'

const words = {
  money,
  percent: (bp: number) => bp / 100 + '%',
  min: (amount: string) => COPY.feeMinWord + ' ' + amount,
  max: (amount: string) => COPY.feeMaxWord + ' ' + amount,
}

function row(rule: AdminFeeRule, action: SaveAction) {
  return {
    key: rule.id,
    cells: [
      rule.sort_order,
      <span key="label">{rule.label_zh}<br /><span className="text-muted-foreground">{rule.label_en}</span></span>,
      feeFormula(rule, words),
      rule.payout_methods?.map((m) => STATUS[m] ?? m).join('、') ?? COPY.feeAllMethods,
      rule.effective_from.slice(0, 10),
      rule.active ? STATUS.active : COPY.feeInactive,
      <details key="edit">
        <summary className="cursor-pointer">{COPY.editFeeRule}</summary>
        <FeeRuleForm rule={rule} action={action} />
      </details>,
    ],
  }
}

export async function FeeRulesSection({ db, action }: { db: SupabaseClient; action: SaveAction }) {
  const rules = await feeRules(db)
  return (
    <Section title={COPY.feeRules}>
      <p className="text-sm text-muted-foreground">{COPY.feeRulesHint}</p>
      <GridTable
        heads={[COPY.feeOrder, COPY.name, COPY.feeFormula, COPY.feeMethods, COPY.feeEffective, COPY.status, COPY.complete]}
        rows={rules.map((rule) => row(rule, action))}
      />
      <details>
        <summary className="cursor-pointer text-sm font-medium">{COPY.addFeeRule}</summary>
        <FeeRuleForm action={action} />
      </details>
    </Section>
  )
}
