import { rate } from '../analytics/values'
import type { ShareCounts } from './posthog'
import type { TemplateStat } from './reads'

// The 「模板」 tab's table (ARCHITECTURE §16.2c), per template, series or category. The margin is
// worked out here at run time, for admins only: what the paid-pool images' credits are worth at
// the cheapest price per credit any product sells at, against what those images really cost.
// No price or cost figure is written into the code.

export const GROUPINGS = ['template', 'series', 'category'] as const
export type Grouping = (typeof GROUPINGS)[number]
export const SORTS = ['uses', 'users', 'success', 'redraw', 'margin', 'cost', 'favourites', 'shares'] as const
export type Sort = (typeof SORTS)[number]

export const DEFAULT_REDRAW_ALERT = 0.3
export const SUCCESS_ALERT = 0.9

export const parseGrouping = (value: unknown): Grouping =>
  (GROUPINGS as readonly unknown[]).includes(value) ? (value as Grouping) : 'template'
export const parseSort = (value: unknown): Sort => ((SORTS as readonly unknown[]).includes(value) ? (value as Sort) : 'uses')

// ?redraw=25 → 25 %; anything else is the default.
export function parseRedrawAlert(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(n) && n >= 1 && n <= 500 ? n / 100 : DEFAULT_REDRAW_ALERT
}

// The lowest price per credit across the products: the most conservative value of a credit.
export function cheapestCreditUsd(products: readonly { priceUsd: number; credits: number }[]): number | null {
  const prices = products.filter((p) => p.priceUsd > 0 && p.credits > 0).map((p) => p.priceUsd / p.credits)
  return prices.length ? Math.min(...prices) : null
}

type Sums = Pick<TemplateStat, 'uses' | 'users' | 'succeeded' | 'failed' | 'redraws' | 'costed' | 'cost_usd' | 'paid_cost_usd' | 'free_cost_usd' | 'credits' | 'paid_credits' | 'uses_14d' | 'favourites' | 'favourites_added'>

export type TemplateLine = Sums & {
  key: string
  label: string
  members: number
  live: boolean
  errors: { code: string; count: number }[]
  shares: number
  shareOpens: number
  successRate: number | null
  redrawRate: number | null
  costPerImage: number | null
  creditsPerImage: number | null
  margin: number | null
  flags: { idle: boolean; redraw: boolean; failing: boolean }
}

const SUM_KEYS = ['uses', 'users', 'succeeded', 'failed', 'redraws', 'costed', 'cost_usd', 'paid_cost_usd', 'free_cost_usd', 'credits', 'paid_credits', 'uses_14d', 'favourites', 'favourites_added'] as const

function keyOf(stat: TemplateStat, grouping: Grouping): { key: string; label: string } {
  if (grouping === 'series') return stat.series_id ? { key: stat.series_id, label: stat.series_name ?? stat.series_id } : { key: '-', label: '' }
  if (grouping === 'category') return { key: stat.category_key ?? '-', label: stat.category_name ?? stat.category_key ?? '' }
  return { key: stat.template_id, label: stat.name_zh ?? stat.name ?? stat.template_id }
}

function mergeErrors(into: Map<string, number>, errors: TemplateStat['errors']) {
  for (const e of errors) into.set(e.code, (into.get(e.code) ?? 0) + e.count)
}

export type TableInput = { stats: readonly TemplateStat[]; shares: ShareCounts | null; creditUsd: number | null; redrawAlert: number }

// Lines for one grouping. A series or category sums its templates; its user count is the sum of
// its templates' (someone who used two of its templates counts twice), and its top errors are the
// top three of its templates' top three.
export function templateLines(input: TableInput, grouping: Grouping): TemplateLine[] {
  const groups = new Map<string, { label: string; stats: TemplateStat[] }>()
  for (const stat of input.stats) {
    const { key, label } = keyOf(stat, grouping)
    const group = groups.get(key) ?? { label, stats: [] }
    group.stats.push(stat)
    groups.set(key, group)
  }
  return [...groups].map(([key, group]) => lineOf(key, group.label, group.stats, input))
}

function lineOf(key: string, label: string, stats: readonly TemplateStat[], input: TableInput): TemplateLine {
  const sums = Object.fromEntries(SUM_KEYS.map((k) => [k, stats.reduce((total, s) => total + s[k], 0)])) as Sums
  const errors = new Map<string, number>()
  stats.forEach((s) => mergeErrors(errors, s.errors))
  const shares = stats.reduce((acc, s) => {
    const own = input.shares?.[s.template_id]
    return { shares: acc.shares + (own?.shares ?? 0), opens: acc.opens + (own?.opens ?? 0) }
  }, { shares: 0, opens: 0 })
  const live = stats.some((s) => s.live)
  const successRate = rate(sums.succeeded, sums.succeeded + sums.failed)
  const redrawRate = rate(sums.redraws, sums.succeeded)
  const value = input.creditUsd === null ? 0 : sums.paid_credits * input.creditUsd
  return {
    ...sums,
    key,
    label,
    members: stats.length,
    live,
    errors: [...errors].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)).slice(0, 3),
    shares: shares.shares,
    shareOpens: shares.opens,
    successRate,
    redrawRate,
    costPerImage: sums.costed > 0 && sums.succeeded > 0 ? sums.cost_usd / sums.succeeded : null,
    creditsPerImage: sums.succeeded > 0 ? sums.credits / sums.succeeded : null,
    margin: value > 0 ? (value - sums.paid_cost_usd) / value : null,
    flags: {
      idle: live && sums.uses_14d === 0,
      redraw: redrawRate !== null && redrawRate > input.redrawAlert,
      failing: successRate !== null && successRate < SUCCESS_ALERT,
    },
  }
}

const SORT_VALUE: Record<Sort, (line: TemplateLine) => number | null> = {
  uses: (l) => l.uses,
  users: (l) => l.users,
  success: (l) => l.successRate,
  redraw: (l) => l.redrawRate,
  margin: (l) => l.margin,
  cost: (l) => l.costPerImage,
  favourites: (l) => l.favourites,
  shares: (l) => l.shares,
}

// Highest first, except success rate and margin, where the worst come first; empty values last.
export function sortLines(lines: readonly TemplateLine[], sort: Sort): TemplateLine[] {
  const value = SORT_VALUE[sort]
  const ascending = sort === 'success' || sort === 'margin'
  return [...lines].sort((a, b) => {
    const x = value(a)
    const y = value(b)
    if (x === null || y === null) return x === y ? b.uses - a.uses : x === null ? 1 : -1
    return (ascending ? x - y : y - x) || b.uses - a.uses || a.key.localeCompare(b.key)
  })
}
