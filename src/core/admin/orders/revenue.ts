import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '@/core/billing'

// admin_revenue_stats (0167, source switched to payments in 0168): net revenue by window, product × channel, a daily trend
// and subscription counts by status. Separate from admin_dashboard_stats by design (§10).

// Net revenue (1181: a refund returns its share of the tax, so never below 0). Signed on purpose so
// one odd row cannot fail the whole overview.
const money = z.coerce.number().finite()
const count = z.coerce.number().int().nonnegative()

const revenueSchema = z.object({
  timezone: z.string(),
  days: z.number().int(),
  windows: z.array(
    z.object({ key: z.enum(['today', '7d', 'period']), since: z.string(), purchases: count, revenue_usd: money }),
  ),
  by_product: z.array(z.object({ product_id: z.string(), channel: z.enum(['stripe', 'waffo']), purchases: count, revenue_usd: money })),
  trend: z.array(z.object({ day: z.string(), revenue_usd: money })),
  subscriptions: z.record(z.string(), count),
})

export type RevenueStats = z.infer<typeof revenueSchema>
export type RevenueWindow = RevenueStats['windows'][number]

export function loadRevenueStats(db: RpcClient, days: number): Promise<RevenueStats> {
  return callRpc(db, 'admin_revenue_stats', { p_days: days }, revenueSchema)
}
