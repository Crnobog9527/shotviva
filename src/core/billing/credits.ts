import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from './rpc'

// Thin service-role wrappers over the balance functions (ARCHITECTURE §6.1). All rules —
// balance checks, idempotency, ledger rows — live in SQL; nothing here writes a balance.

export const PRODUCT_IDS = ['pass', 'pack'] as const
export type ProductId = (typeof PRODUCT_IDS)[number]

export type CreditChange = {
  // false when the idempotency key had already been applied (a safe replay).
  applied: boolean
  balance: number
  paidUntil: Date | null
}

const creditChangeSchema = z
  .object({
    applied: z.boolean(),
    balance: z.number().int().nonnegative(),
    paid_until: z.string().nullable(),
  })
  .transform(
    (row): CreditChange => ({
      applied: row.applied,
      balance: row.balance,
      paidUntil: row.paid_until === null ? null : new Date(row.paid_until),
    }),
  )

const userId = z.uuid()
const key = z.string().min(1)
const reason = z.string().min(1)

export function signupGrantKey(id: string): string {
  return `signup:${id}`
}

export async function grantCredits(
  client: RpcClient,
  input: { userId: string; amount: number; reason: string; idempotencyKey: string },
): Promise<CreditChange> {
  const args = z
    .object({ userId, amount: z.number().int().positive(), reason, idempotencyKey: key })
    .parse(input)
  return callRpc(
    client,
    'grant_credits',
    {
      p_user_id: args.userId,
      p_amount: args.amount,
      p_reason: args.reason,
      p_idempotency_key: args.idempotencyKey,
    },
    creditChangeSchema,
  )
}

// Called by the payment webhooks after signature check; eventId is the channel's event id.
export async function applyPurchase(
  client: RpcClient,
  input: { userId: string; productId: ProductId; eventId: string },
): Promise<CreditChange> {
  const args = z.object({ userId, productId: z.enum(PRODUCT_IDS), eventId: key }).parse(input)
  return callRpc(
    client,
    'apply_purchase',
    { p_user_id: args.userId, p_product_id: args.productId, p_event_id: args.eventId },
    creditChangeSchema,
  )
}

export async function adminAdjustCredits(
  client: RpcClient,
  input: { userId: string; amount: number; reason: string; idempotencyKey?: string },
): Promise<CreditChange> {
  const args = z
    .object({
      userId,
      amount: z
        .number()
        .int()
        .refine((n) => n !== 0),
      reason,
      idempotencyKey: key.optional(),
    })
    .parse(input)
  return callRpc(
    client,
    'admin_adjust_credits',
    {
      p_user_id: args.userId,
      p_amount: args.amount,
      p_reason: args.reason,
      p_idempotency_key: args.idempotencyKey ?? null,
    },
    creditChangeSchema,
  )
}

// Paid status decides private works, no watermark and commercial use (ARCHITECTURE §6.1).
export async function isPaid(client: RpcClient, id: string): Promise<boolean> {
  return callRpc(client, 'is_paid', { p_user_id: userId.parse(id) }, z.boolean())
}
