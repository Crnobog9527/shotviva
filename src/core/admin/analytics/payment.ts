import { z } from 'zod'

import { bothPeriods, currentPeriod, periodColumn } from './hogql'
import { rowsOf, type HogQL, type RunQuery } from './posthog-query'
import type { Window } from './range'
import { count, flag, label, rate } from './values'

// Block 3 「付款环节」 (ARCHITECTURE §16.2a): which products people pick in the paywall
// (paywall_select) and whether they then went to pay for that product (checkout_start); per
// payment method, how many who started a checkout paid; and how often checkout was cancelled.

// The four methods the Owner reads (§16.2a). Waffo is one route whatever the method; 支付宝 and
// 微信支付 are one Stripe route (T73).
export const METHOD_GROUPS = ['card', 'cn_card', 'alipay_wechat', 'waffo'] as const
export type MethodGroup = (typeof METHOD_GROUPS)[number]

const METHOD_GROUP_EXPR = `multiIf(
    properties.channel = 'waffo', 'waffo',
    properties.method IN ('alipay', 'wechat_pay', 'wechat'), 'alipay_wechat',
    properties.method = 'cn_card', 'cn_card',
    properties.method = 'card', 'card',
    'other')`

export function productPicksQuery(window: Window): HogQL {
  return {
    name: 'payment.picks',
    query: `
SELECT product, sum(times) AS picks, count() AS pickers, countIf(started) AS went_to_pay
FROM (
  SELECT person_id, toString(properties.product_id) AS product,
    countIf(event = 'paywall_select') AS times, countIf(event = 'checkout_start') > 0 AS started
  FROM events WHERE event IN ('paywall_select', 'checkout_start') AND ${currentPeriod(window)}
  GROUP BY person_id, product
)
WHERE times > 0
GROUP BY product ORDER BY picks DESC LIMIT 20`,
  }
}

export function methodsQuery(window: Window): HogQL {
  return {
    name: 'payment.methods',
    query: `
SELECT cur, method,
  uniqIf(person_id, event = 'checkout_start') AS started,
  uniqIf(person_id, event = 'purchase') AS paid,
  countIf(event = 'checkout_cancel') AS cancels
FROM (
  SELECT person_id, event, ${periodColumn(window)} AS cur, ${METHOD_GROUP_EXPR} AS method
  FROM events WHERE event IN ('checkout_start', 'purchase', 'checkout_cancel') AND ${bothPeriods(window)}
)
GROUP BY cur, method LIMIT 50`,
  }
}

const pickRow = z.object({ product: label, picks: count, pickers: count, went_to_pay: count })
const methodRow = z.object({ cur: flag, method: label, started: count, paid: count, cancels: count })

export type ProductPick = { productId: string; picks: number; pickers: number; wentToPay: number; payRate: number | null }
export type MethodStats = { started: number; paid: number; payRate: number | null }
export type MethodRow = { method: MethodGroup; current: MethodStats; previous: MethodStats }
export type Payment = { picks: ProductPick[]; methods: MethodRow[]; cancels: { current: number; previous: number } }

const stats = (rows: z.infer<typeof methodRow>[]): MethodStats => {
  const started = rows.reduce((sum, row) => sum + row.started, 0)
  const paid = rows.reduce((sum, row) => sum + row.paid, 0)
  return { started, paid, payRate: rate(paid, started) }
}

export function shapePayment(picks: z.infer<typeof pickRow>[], methods: z.infer<typeof methodRow>[]): Payment {
  const of = (method: MethodGroup, cur: boolean) => methods.filter((row) => row.method === method && row.cur === cur)
  const cancels = (cur: boolean) => methods.filter((row) => row.cur === cur).reduce((sum, row) => sum + row.cancels, 0)
  return {
    picks: picks
      .filter((row) => row.product !== '')
      .map((row) => ({ productId: row.product, picks: row.picks, pickers: row.pickers, wentToPay: row.went_to_pay, payRate: rate(row.went_to_pay, row.pickers) })),
    methods: METHOD_GROUPS.map((method) => ({ method, current: stats(of(method, true)), previous: stats(of(method, false)) })),
    cancels: { current: cancels(true), previous: cancels(false) },
  }
}

export async function loadPayment(run: RunQuery, window: Window): Promise<Payment> {
  const picks = rowsOf(await run(productPicksQuery(window)), pickRow)
  const methods = rowsOf(await run(methodsQuery(window)), methodRow)
  return shapePayment(picks, methods)
}
