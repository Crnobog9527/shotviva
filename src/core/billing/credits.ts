import 'server-only'

import { z } from 'zod'

import { CREDIT_POOLS, type CreditPool } from './pools'
import { callRpc, type RpcClient } from './rpc'

// Thin service-role wrappers over the balance functions (ARCHITECTURE §6.1). All rules —
// pool choice, balance checks, idempotency, ledger rows — live in SQL; nothing here writes
// a balance.

export const PRODUCT_IDS = ['pass', 'pack'] as const
export type ProductId = (typeof PRODUCT_IDS)[number]

export type CreditChange = {
  // false when the idempotency key had already been applied (a safe replay).
  applied: boolean
  // Paid pool (profiles.credits).
  credits: number
  // Free pool (profiles.free_credits).
  freeCredits: number
  // Membership period, display only; it decides no entitlement.
  paidUntil: Date | null
}

const creditChangeSchema = z
  .object({
    applied: z.boolean(),
    credits: z.number().int().nonnegative(),
    free_credits: z.number().int().nonnegative(),
    paid_until: z.string().nullable(),
  })
  .transform(
    (row): CreditChange => ({
      applied: row.applied,
      credits: row.credits,
      freeCredits: row.free_credits,
      paidUntil: row.paid_until === null ? null : new Date(row.paid_until),
    }),
  )

const userId = z.uuid()
const key = z.string().min(1)
const reason = z.string().min(1)
const pool = z.enum(CREDIT_POOLS)

export function signupGrantKey(id: string): string {
  return `signup:${id}`
}

export async function grantCredits(
  client: RpcClient,
  input: { userId: string; amount: number; reason: string; idempotencyKey: string; pool: CreditPool },
): Promise<CreditChange> {
  const args = z
    .object({ userId, amount: z.number().int().positive(), reason, idempotencyKey: key, pool })
    .parse(input)
  return callRpc(
    client,
    'grant_credits',
    {
      p_user_id: args.userId,
      p_amount: args.amount,
      p_reason: args.reason,
      p_idempotency_key: args.idempotencyKey,
      p_pool: args.pool,
    },
    creditChangeSchema,
  )
}

// Called by the payment webhooks after signature check; eventId is the channel's event id.
// Always credits the paid pool; only products with days move paid_until.
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
  input: { userId: string; amount: number; reason: string; pool: CreditPool; idempotencyKey?: string },
): Promise<CreditChange> {
  const args = z
    .object({
      userId,
      amount: z
        .number()
        .int()
        .refine((n) => n !== 0),
      reason,
      pool,
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
      p_pool: args.pool,
      p_idempotency_key: args.idempotencyKey ?? null,
    },
    creditChangeSchema,
  )
}
