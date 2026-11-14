import type { Goal } from '../../experiments'
import type { ResultRow, VariantRow } from './schemas'
import type { VariantVisitors } from './visitors'

// The results table of /admin/experiments (ARCHITECTURE §16.5). Each person counts against the
// variant they saw first. The goal rate is goal people ÷ visitors of the variant. A difference is
// only called once both sides are big enough AND a two-sided two-proportion test says p < 0.05;
// otherwise the page says "not enough data yet" and never names a winner. The days estimate is an
// estimate, labelled as one: how long until each variant has the visitors needed to see a 30%
// change of the control's rate (95% confidence, 80% power), at the pace so far.

export const MIN_VISITORS = 100
export const MIN_GOALS = 10
export const DETECTABLE_LIFT = 0.3
const Z_ALPHA = 1.96
const Z_POWER = 0.84
const DAY_MS = 24 * 60 * 60 * 1000

export type VariantResult = {
  id: number
  label: string
  optionId: string
  control: boolean
  archived: boolean
  visitors: number | null
  movedIn: number | null
  signups: number
  firstGenerations: number
  payments: number
  nowOn: number
  moved: number
  goal: number
  rate: number | null
}

export type Verdict =
  | { kind: 'no_visitors' }
  | { kind: 'not_enough'; daysLeft: number | null }
  | { kind: 'no_difference'; daysLeft: number | null }
  | { kind: 'difference'; better: number[]; worse: number[] }

const goalOf = (row: Pick<VariantResult, 'signups' | 'firstGenerations' | 'payments'>, goal: Goal) =>
  goal === 'signup' ? row.signups : goal === 'first_generation' ? row.firstGenerations : row.payments

type Counts = Pick<VariantResult, 'signups' | 'firstGenerations' | 'payments' | 'nowOn' | 'moved'>

function countsOf(row: ResultRow | undefined): Counts {
  if (!row) return { signups: 0, firstGenerations: 0, payments: 0, nowOn: 0, moved: 0 }
  return { signups: row.signups, firstGenerations: row.first_generations, payments: row.payments, nowOn: row.now_on, moved: row.moved }
}

// null when visitors could not be read at all; 0 for a variant nobody was put on yet.
function seenOf(visitors: VariantVisitors[] | null, id: number): { visitors: number | null; movedIn: number | null } {
  if (!visitors) return { visitors: null, movedIn: null }
  const seen = visitors.find((row) => row.variantId === id)
  return { visitors: seen?.visitors ?? 0, movedIn: seen?.movedIn ?? 0 }
}

export function combine(variants: VariantRow[], db: ResultRow[], visitors: VariantVisitors[] | null, goal: Goal): VariantResult[] {
  return variants.map((variant) => {
    const counts = countsOf(db.find((row) => row.variant_id === variant.id))
    const seen = seenOf(visitors, variant.id)
    const goalCount = goalOf(counts, goal)
    return {
      id: variant.id,
      label: variant.label,
      optionId: variant.option_id,
      control: variant.is_control,
      archived: variant.archived_at !== null,
      ...seen,
      ...counts,
      goal: goalCount,
      rate: seen.visitors ? goalCount / seen.visitors : null,
    }
  })
}

// Two-sided p-value of the two-proportion z test (pooled), by the normal tail (Abramowitz–Stegun 26.2.17).
export function twoProportionP(a: { goal: number; visitors: number }, b: { goal: number; visitors: number }): number {
  const pooled = (a.goal + b.goal) / (a.visitors + b.visitors)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.visitors + 1 / b.visitors))
  if (!se) return 1
  const z = Math.abs(a.goal / a.visitors - b.goal / b.visitors) / se
  const t = 1 / (1 + 0.2316419 * z)
  const tail = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return Math.min(1, 2 * tail)
}

// Visitors each variant needs to see a DETECTABLE_LIFT change of the control's rate.
export function neededPerVariant(controlRate: number): number | null {
  if (controlRate <= 0 || controlRate >= 1) return null
  const other = Math.min(0.99, controlRate * (1 + DETECTABLE_LIFT))
  const spread = controlRate * (1 - controlRate) + other * (1 - other)
  return Math.ceil(((Z_ALPHA + Z_POWER) ** 2 * spread) / (other - controlRate) ** 2)
}

// Days until the smallest open variant reaches `neededPerVariant`, at its pace since the start.
export function daysLeft(rows: VariantResult[], startedAt: string | null, now: number): number | null {
  const control = rows.find((row) => row.control)
  const open = rows.filter((row) => !row.archived && row.visitors !== null)
  if (!control?.rate || !startedAt || open.length === 0) return null
  const needed = neededPerVariant(control.rate)
  const days = (now - Date.parse(startedAt)) / DAY_MS
  if (needed === null || days <= 0) return null
  const slowest = Math.min(...open.map((row) => row.visitors ?? 0))
  if (slowest >= needed) return 0
  const pace = slowest / days
  return pace > 0 ? Math.ceil((needed - slowest) / pace) : null
}

export function verdictOf(rows: VariantResult[], startedAt: string | null, now: number): Verdict {
  const control = rows.find((row) => row.control)
  if (!control?.visitors) return { kind: 'no_visitors' }
  const others = rows.filter((row) => !row.control && !row.archived && row.visitors)
  const left = daysLeft(rows, startedAt, now)
  const sized = (row: VariantResult) => (row.visitors ?? 0) >= MIN_VISITORS
  if (!sized(control) || others.some((row) => !sized(row)) || control.goal + others.reduce((sum, row) => sum + row.goal, 0) < MIN_GOALS) {
    return { kind: 'not_enough', daysLeft: left }
  }
  const differing = others.filter((row) => twoProportionP({ goal: row.goal, visitors: row.visitors ?? 0 }, { goal: control.goal, visitors: control.visitors ?? 0 }) < 0.05)
  if (differing.length === 0) return { kind: 'no_difference', daysLeft: left }
  const controlRate = control.rate ?? 0
  return {
    kind: 'difference',
    better: differing.filter((row) => (row.rate ?? 0) > controlRate).map((row) => row.id),
    worse: differing.filter((row) => (row.rate ?? 0) <= controlRate).map((row) => row.id),
  }
}
