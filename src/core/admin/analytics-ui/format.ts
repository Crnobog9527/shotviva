import { change } from '../analytics/values'

// Number formatting for the analytics page: Chinese digits grouping, percentages to one decimal.

const integer = new Intl.NumberFormat('zh-CN')
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 })

export const DASH = '—'

export const n = (value: number) => integer.format(value)
export const pct = (value: number | null) => (value === null ? DASH : percent.format(value))

export function duration(seconds: number | null): string {
  if (seconds === null) return DASH
  if (seconds < 60) return `${Math.round(seconds)} 秒`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分`
}

export function hours(value: number | null): string {
  if (value === null) return DASH
  if (value < 1) return `${Math.max(1, Math.round(value * 60))} 分钟`
  if (value < 48) return `${value.toFixed(1)} 小时`
  return `${(value / 24).toFixed(1)} 天`
}

export function ms(value: number | null): string {
  if (value === null) return DASH
  return value < 1000 ? `${Math.round(value)} 毫秒` : `${(value / 1000).toFixed(1)} 秒`
}

// "+12%" / "−8%" against the previous period, or null when there is nothing to compare.
export type Delta = { text: string; direction: 'up' | 'down' | 'same' } | null

export function delta(current: number | null, previous: number | null): Delta {
  const value = change(current, previous)
  if (value === null) return null
  if (Math.abs(value) < 0.005) return { text: '0%', direction: 'same' }
  const text = `${value > 0 ? '+' : '−'}${percent.format(Math.abs(value))}`
  return { text, direction: value > 0 ? 'up' : 'down' }
}

// Percentage-point change for rates (a success rate going from 40% to 46% is +6 points).
export function pointDelta(current: number | null, previous: number | null): Delta {
  if (current === null || previous === null) return null
  const points = (current - previous) * 100
  if (Math.abs(points) < 0.05) return { text: '0 个百分点', direction: 'same' }
  return { text: `${points > 0 ? '+' : '−'}${Math.abs(points).toFixed(1)} 个百分点`, direction: points > 0 ? 'up' : 'down' }
}

// Web Vitals thresholds (web.dev): good / needs improvement / poor.
const THRESHOLDS = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25], fcp: [1800, 3000] } as const
export type Vital = keyof typeof THRESHOLDS
export type Rating = 'good' | 'fair' | 'poor'

export function rating(metric: Vital, value: number | null): Rating | null {
  if (value === null) return null
  const [good, poor] = THRESHOLDS[metric]
  if (value <= good) return 'good'
  return value <= poor ? 'fair' : 'poor'
}
