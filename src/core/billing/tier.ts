import 'server-only'

import { z } from 'zod'

import { MEMBERSHIP_TIERS, type MembershipTier } from '../config'
import { callRpc, type RpcClient } from './rpc'

export {
  BASE_SUPPORT_REPLY_HOURS,
  NO_TIER_CONCURRENCY,
  TIER_CONCURRENCY,
  TIER_SUPPORT_REPLY_HOURS,
  concurrencyFor,
} from './tier-limits'

// Membership tier perks (ARCHITECTURE §6.2 "会员档位权益"). The tier itself comes only from the
// SQL function current_tier(); code never derives it from paid_until or purchases on its own.
// The tier never decides watermark, privacy or commercial use: those follow the work's pool.

export async function currentTier(client: RpcClient, userId: string): Promise<MembershipTier | null> {
  const id = z.uuid().parse(userId)
  return callRpc(client, 'current_tier', { p_user_id: id }, z.enum(MEMBERSHIP_TIERS).nullable())
}
