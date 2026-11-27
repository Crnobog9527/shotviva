import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '../billing/rpc'
import { PAYMENT_KINDS, type PaymentKind } from './payment-labels'

// Where enterprise customers wire the offline payment (ARCHITECTURE §6.5). Two groups with fixed
// fields; the values are entered by the platform admin and exist only in each database.

const uuid = z.uuid()
const details = z.record(z.string(), z.string().max(1000))

export const paymentAccountSchema = z.object({
  kind: z.enum(PAYMENT_KINDS),
  enabled: z.boolean(),
  details,
  expected_updated_at: z.string().optional(),
})

export type PaymentAccountView = { kind: PaymentKind; details: Record<string, string>; updated_at: string }

// Admin: save one group; returns the new updated_at, the expected_updated_at of the next save.
export async function adminSavePaymentAccount(client: RpcClient, actor: string, input: z.input<typeof paymentAccountSchema>): Promise<string> {
  return callRpc(client, 'admin_org_payment_account_save', { p_actor: uuid.parse(actor), p_input: paymentAccountSchema.parse(input) }, z.string())
}

// For the org owner's package section: the enabled groups only. `owner` is the signed-in account
// from the server session; anyone who owns no org (members included) gets NOT_ORG_OWNER.
export async function getOrgPaymentAccounts(client: RpcClient, owner: string): Promise<PaymentAccountView[]> {
  const row = z.object({ kind: z.enum(PAYMENT_KINDS), details, updated_at: z.string() })
  return callRpc(client, 'org_payment_accounts_for_owner', { p_owner: uuid.parse(owner) }, z.array(row))
}
