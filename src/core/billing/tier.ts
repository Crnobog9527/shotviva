import 'server-only'

import { z } from 'zod'

import { MEMBERSHIP_TIERS, type MembershipTier } from '../config'
import { callRpc, type RpcClient } from './rpc'

// Membership tier perks (ARCHITECTURE §6.2 "会员档位权益"). The tier itself comes only from the
// SQL function current_tier(); code never derives it from paid_until or purchases on its own.
// The tier never decides watermark, privacy or commercial use: those follow the work's pool.

// Generations in flight at once. No tier (never paid, expired, packs only) counts as 1.
export const TIER_CONCURRENCY: Record<MembershipTier, number> = { starter: 1, pro: 3, max: 6 }
export const NO_TIER_CONCURRENCY = 1

export function concurrencyFor(tier: MembershipTier | null): number {
  return tier ? TIER_CONCURRENCY[tier] : NO_TIER_CONCURRENCY
}

export async function currentTier(client: RpcClient, userId: string): Promise<MembershipTier | null> {
  const id = z.uuid().parse(userId)
  return callRpc(client, 'current_tier', { p_user_id: id }, z.enum(MEMBERSHIP_TIERS).nullable())
}
