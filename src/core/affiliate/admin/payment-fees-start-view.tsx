import type { SupabaseClient } from '@supabase/supabase-js'
import { formatBeijing } from '@/core/admin/shell'
import { MutationForm, type SaveAction } from './form'
import { Hidden, Section } from './parts'
import { feesStartState } from './payment-fees-start'
import { START_COPY as S } from './payment-fees-start-copy'

// The go-live card (ARCHITECTURE §6.2 订单手续费 · 上线): what is in force now, and, until fees are
// recorded, the one-way switch that starts them together with the newest terms.
export async function PaymentFeesStart({ db, action, latestTerms }: { db: SupabaseClient; action: SaveAction; latestTerms: string }) {
  const { recordFrom, termsVersion } = await feesStartState(db)
  return (
    <Section title={S.title}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{S.recordFrom}</dt>
        <dd>{recordFrom ? formatBeijing(recordFrom) : S.notStarted}</dd>
        <dt className="text-muted-foreground">{S.terms}</dt>
        <dd>{termsVersion}</dd>
      </dl>
      {recordFrom ? (
        <p className="text-sm text-muted-foreground">{S.startedHint}</p>
      ) : (
        <MutationForm action={action} operation="feesStart" label={S.button} destructive>
          <p className="text-sm">{S.explain(latestTerms)}</p>
          <Hidden name="expected_record_from" value="" />
          <Hidden name="expected_terms_version" value={termsVersion} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm" required className="mt-1" />
            <span>{S.confirm(latestTerms)}</span>
          </label>
        </MutationForm>
      )}
    </Section>
  )
}
