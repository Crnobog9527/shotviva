import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '../errors'

type PaymentKeys = { stripe_session_id?: string | null; stripe_invoice_id?: string | null; waffo_payment_id?: string | null }

// Same keys as _payment_granted_credits. Older purchases retain the exact grant that was
// made, even if the catalogue changes. Missing ledger evidence stays unknown.
export function paymentGrantKey(row: PaymentKeys): string | null {
  if (row.stripe_session_id) return `purchase:${row.stripe_session_id}`
  if (row.stripe_invoice_id) return `renewal:${row.stripe_invoice_id}`
  return row.waffo_payment_id ? `purchase:${row.waffo_payment_id}` : null
}

export async function paymentGrants(db: SupabaseClient, userId: string, keys: readonly (string | null)[]) {
  const ids = [...new Set(keys.filter((key): key is string => key !== null))]
  if (!ids.length) return new Map<string, number>()
  const { data, error } = await db.from('credit_ledger').select('idempotency_key,delta')
    .eq('user_id', userId).eq('kind', 'purchase').eq('pool', 'paid').in('idempotency_key', ids)
    .returns<{ idempotency_key: string; delta: number }[]>()
  if (error) throw new AppError('INTERNAL', 'Could not read credits granted for the purchase')
  return new Map(data.map((row) => [row.idempotency_key, row.delta]))
}
