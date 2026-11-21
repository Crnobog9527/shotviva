import 'server-only'

import { z } from 'zod'

import { MEMBERSHIP_TIERS, type MembershipTier } from '../config'
import { callRpc, type RpcClient } from './rpc'
import { BATCH_SIZE_CEILING, limitsFor, type EffectiveLimits } from './tier-limits'

const shape = z.object({
  tier: z.enum(MEMBERSHIP_TIERS).nullable(),
  concurrency: z.number().int().min(1),
  per_window: z.number().int().min(1),
  batch_max: z.number().int().min(1).max(BATCH_SIZE_CEILING),
  multi_template_max: z.number().int().min(1),
  batch_zip: z.boolean(),
  early_features: z.boolean(),
  org_id: z.uuid().nullable(),
})

// The limits that apply to this account (ARCHITECTURE §6.5): SQL effective_limits(), the larger
// of the tier value (effective_tier(): an unbanned admin counts as Max) and the org value, the
// org value capped by system_settings.org_limit_caps. Support reply time and vote weight stay
// per tier. Always pass the session's own user id and a service-role client.
export async function effectiveLimits(client: RpcClient, userId: string): Promise<EffectiveLimits> {
  const id = z.uuid().parse(userId)
  const row = await callRpc(client, 'effective_limits', { p_user_id: id }, shape)
  return {
    ...limitsFor(row.tier),
    tier: row.tier,
    concurrency: row.concurrency,
    perWindow: row.per_window,
    batchMax: row.batch_max,
    multiTemplateMax: row.multi_template_max,
    batchZip: row.batch_zip,
    earlyFeatures: row.early_features,
    orgId: row.org_id,
  }
}

// The tier a feature_access gate sees: Max when the org opens early features, the account's own
// effective tier otherwise.
export const featureTierOf = (limits: EffectiveLimits): MembershipTier | null => (limits.earlyFeatures ? 'max' : limits.tier)
