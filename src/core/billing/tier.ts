import 'server-only'

import { z } from 'zod'

import { MEMBERSHIP_TIERS, type MembershipTier } from '../config'
import { callRpc, type RpcClient } from './rpc'

export {
  BASE_SUPPORT_REPLY_HOURS,
  MAX_BATCH_SIZE,
  TIER_LIMITS,
  batchUpgrade,
  limitsFor,
  tierForBatch,
  type TierLimits,
} from './tier-limits'

// Membership tier perks (ARCHITECTURE §6.2 "会员档位权益"). The tier itself comes only from the
// SQL function current_tier(); code never derives it from paid_until or purchases on its own.
// The tier never decides watermark, privacy or commercial use: those follow the work's pool.

export async function currentTier(client: RpcClient, userId: string): Promise<MembershipTier | null> {
  const id = z.uuid().parse(userId)
  return callRpc(client, 'current_tier', { p_user_id: id }, z.enum(MEMBERSHIP_TIERS).nullable())
}

// The tier that unlocks tier-gated features (TIER_LIMITS, multi-template batches, batch ZIPs,
// feature_access): SQL effective_tier(), which is Max for an unbanned admin and current_tier()
// for everyone else, so the Owner can use every feature on their own account. Billing (pack member
// rates, upgrade rules, the membership card), support reply time and vote weight stay on
// currentTier(): admins still pay credits and plans like anyone. Always pass the session's own
// user id and a service-role client; never a tier or a role taken from the request.
export async function effectiveTier(client: RpcClient, userId: string): Promise<MembershipTier | null> {
  const id = z.uuid().parse(userId)
  return callRpc(client, 'effective_tier', { p_user_id: id }, z.enum(MEMBERSHIP_TIERS).nullable())
}
