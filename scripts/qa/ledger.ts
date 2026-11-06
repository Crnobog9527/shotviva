import type { SupabaseClient } from '@supabase/supabase-js'

import {
  MAX_PRODUCT_ID,
  MAX_PURCHASE_EVENT_ID,
  resetKey,
  SIGNUP_FREE_CREDITS,
  signupKey,
} from './personas'

// Every balance or tier change goes through an existing SQL function with a fixed or
// state-derived idempotency key, so each one writes the ledger (AGENTS §5) and a rerun
// replays instead of adding.

export type Profile = {
  role: string
  credits: number
  free_credits: number
  paid_until: string | null
  banned_at: string | null
}

export async function rpc(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw new Error(`${fn} failed: ${error.message}`)
  return data
}

// credit_change.applied: false when the key had already been used (a replay).
function applied(change: unknown): boolean {
  return typeof change === 'object' && change !== null && (change as { applied?: unknown }).applied === true
}

export async function readProfile(db: SupabaseClient, userId: string): Promise<Profile> {
  const { data, error } = await db
    .from('profiles')
    .select('role, credits, free_credits, paid_until, banned_at')
    .eq('id', userId)
    .single()
  if (error) throw new Error(`profile ${userId} not readable: ${error.message}`)
  return data as Profile
}

export async function currentTier(db: SupabaseClient, userId: string): Promise<string | null> {
  return (await rpc(db, 'current_tier', { p_user_id: userId })) as string | null
}

// Index credit_ledger_user_id_created_at_idx (user_id, created_at desc); one row.
export async function latestLedgerId(db: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await db
    .from('credit_ledger')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
  if (error) throw new Error(`ledger read failed: ${error.message}`)
  return data.length > 0 ? Number(data[0].id) : 0
}

// What the app's first verified sign-in grants, with the app's own key.
export async function grantSignup(db: SupabaseClient, userId: string): Promise<boolean> {
  return applied(await rpc(db, 'grant_credits', {
    p_user_id: userId,
    p_amount: SIGNUP_FREE_CREDITS,
    p_reason: 'signup',
    p_idempotency_key: signupKey(userId),
    p_pool: 'free',
  }))
}

export async function purchaseMax(db: SupabaseClient, userId: string): Promise<boolean> {
  return applied(
    await rpc(db, 'apply_purchase', { p_user_id: userId, p_product_id: MAX_PRODUCT_ID, p_event_id: MAX_PURCHASE_EVENT_ID }),
  )
}

// Brings one pool back to its target after a validation round spent or added credits.
export async function resetPool(db: SupabaseClient, userId: string, pool: 'free' | 'paid', target: number): Promise<boolean> {
  const profile = await readProfile(db, userId)
  const delta = target - (pool === 'paid' ? profile.credits : profile.free_credits)
  if (delta === 0) return false
  await rpc(db, 'admin_adjust_credits', {
    p_user_id: userId,
    p_amount: delta,
    p_reason: `qa reset ${pool} to ${target}`,
    p_pool: pool,
    p_idempotency_key: resetKey(userId, pool, await latestLedgerId(db, userId)),
  })
  return true
}

export async function unban(db: SupabaseClient, userId: string): Promise<void> {
  await rpc(db, 'admin_unban_user', { p_user_id: userId, p_reason: 'qa:accounts reset' })
}
