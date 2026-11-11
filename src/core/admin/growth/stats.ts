import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '@/core/billing'

import type { Window } from '../analytics/range'

// admin_growth_stats (1180, ARCHITECTURE §16.2b): the database half of 「流量与转化」 — sign-ups,
// first images, payments and money for the current and previous period, admin accounts left out.
// The cohort and buyer ids stay on the server: they only steer the PostHog half of the page.

const count = z.number().int().nonnegative()
const money = z.coerce.number().nonnegative()
// Net amounts are not negative by definition (1180/1181 return a refund's tax), but a bad row must
// never turn the whole overview into 「暂时读不到」, so they are only required to be numbers.
const net = z.coerce.number().finite()
const uuid = z.uuid()
const slice = z.object({ orders: count, net_usd: net })

const periodSchema = z.object({
  since: z.string(),
  until: z.string(),
  signups: count,
  new_users: z.object({ first_image: count, paid: count }),
  returning: z.object({ active: count, paid: count }),
  payers: count,
  orders: z.object({ total: count, first: count, repeat: count, renewal: count, non_usd: count }),
  money: z.object({ net_usd: net, tax_usd: money, refunded_usd: money }),
  by_kind: z.object({ first: net, repeat: net, renewal: net }),
  by_type: z.object({ plan: slice, pack: slice }),
  by_channel: z.object({ stripe: slice, waffo: slice }),
  refunds: z.object({ count, usd: money }),
  disputes: z.object({ count, usd: money }),
  affiliate: z.object({ signups: count, payers: count, net_usd: net }),
  cohort: z.array(uuid),
  buyers: z.array(z.object({ user_id: uuid, net_usd: net, orders: count })),
})

const growthSchema = z.object({
  timezone: z.literal('Asia/Shanghai'),
  admin_ids: z.array(uuid),
  periods: z.object({ current: periodSchema, previous: periodSchema }),
})

export type GrowthPeriod = z.infer<typeof periodSchema>
export type GrowthStats = z.infer<typeof growthSchema>

export function loadGrowthStats(db: RpcClient, window: Window): Promise<GrowthStats> {
  return callRpc(
    db,
    'admin_growth_stats',
    { p_start: window.start, p_end: window.end, p_prev_start: window.prevStart, p_prev_end: window.prevEnd },
    growthSchema,
  )
}
