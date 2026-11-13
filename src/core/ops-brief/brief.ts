import { FUNNEL_STEPS, type FunnelStepKey } from '@/core/admin/analytics/funnel-options'
import type { Window } from '@/core/admin/analytics/range'

// The daily ops brief to the Owner's Feishu group (decision D12, ops review B1). Pure: the shapes,
// the sums and the text. Today (Beijing midnight to now) is compared with yesterday up to the same
// time of day, the way /admin/analytics compares 「今天」. Every part is read on its own; one that
// could not be read says so and the rest still go out.

export type Pair = { today: number; yesterday: number }

// null: that part could not be read this time.
export type BriefData = {
  window: Window
  signups: Pair | null
  generated: Pair | null
  failed: Pair | null
  payments: Pair | null
  // US dollars, net of refunds and tax (admin_revenue_stats' rule).
  netRevenue: Pair | null
  // People reaching each funnel step today (FUNNEL_STEPS order); 'unset' without the PostHog key.
  funnel: readonly number[] | 'unset' | null
  openTickets: number | null
}

// One payments row, as the payments table stores it (amounts in cents).
export type PaymentRow = {
  created_at: string
  currency: string | null
  amount_total: number | null
  amount_refunded: number | null
  amount_tax: number | null
}

// admin_revenue_stats (1181): (total − refunded) × (total − tax) / total, rounded to a cent; only
// US dollar payments count towards revenue, every row counts as a payment.
export function netCents(row: PaymentRow): number {
  const total = row.amount_total ?? 0
  if (row.currency !== 'usd' || total <= 0) return 0
  return Math.round(((total - (row.amount_refunded ?? 0)) * (total - (row.amount_tax ?? 0))) / total)
}

// Splits the rows read for [prevStart, end) into today's window and yesterday's same window.
export function sumPayments(rows: readonly PaymentRow[], window: Window): { payments: Pair; netRevenue: Pair } {
  const inside = (row: PaymentRow, start: string, end: string) => {
    const at = Date.parse(row.created_at)
    return at >= Date.parse(start) && at < Date.parse(end)
  }
  const today = rows.filter((row) => inside(row, window.start, window.end))
  const yesterday = rows.filter((row) => inside(row, window.prevStart, window.prevEnd))
  const net = (list: PaymentRow[]) => list.reduce((sum, row) => sum + netCents(row), 0) / 100
  return {
    payments: { today: today.length, yesterday: yesterday.length },
    netRevenue: { today: net(today), yesterday: net(yesterday) },
  }
}

export const STEP_LABELS: Record<FunnelStepKey, string> = {
  visit: '进站',
  upload: '上传',
  generate: '出图',
  paywall: '付费墙',
  checkout: '开始结账',
  purchase: '付款',
}

export type Drop = { from: FunnelStepKey; to: FunnelStepKey; before: number; after: number; lostShare: number }

// The step that loses the largest share of the people who reached the step before it; a tie goes
// to the one that loses more people, then to the earlier step. null when nobody moved at all.
export function biggestDrop(counts: readonly number[]): Drop | null {
  let best: Drop | null = null
  for (let i = 1; i < FUNNEL_STEPS.length; i++) {
    const before = counts[i - 1] ?? 0
    const after = Math.min(counts[i] ?? 0, before)
    if (before <= 0) continue
    const drop: Drop = { from: FUNNEL_STEPS[i - 1]!.key, to: FUNNEL_STEPS[i]!.key, before, after, lostShare: (before - after) / before }
    const better =
      !best ||
      drop.lostShare > best.lostShare ||
      (drop.lostShare === best.lostShare && drop.before - drop.after > best.before - best.after)
    if (better) best = drop
  }
  return best
}

const UNREAD = '暂时读不到'

const beijing = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hourCycle: 'h23', ...options }).format(new Date(iso))

function signed(delta: number, format: (n: number) => string): string {
  if (delta === 0) return '持平'
  return `${delta > 0 ? '+' : '−'}${format(Math.abs(delta))}`
}

const plain = (n: number) => String(n)
const usd = (n: number) => `$${n.toFixed(2)}`

function pairLine(label: string, pair: Pair | null, format: (n: number) => string = plain, unit = ''): string {
  if (!pair) return `${label}：${UNREAD}`
  return `${label}：${format(pair.today)}${unit}（昨天 ${format(pair.yesterday)}${unit}，${signed(pair.today - pair.yesterday, format)}）`
}

function funnelLine(counts: BriefData['funnel']): string {
  if (counts === 'unset') return '漏斗掉得最多：后台还没配 PostHog 只读 key'
  if (!counts) return `漏斗掉得最多：${UNREAD}`
  const drop = biggestDrop(counts)
  if (!drop) return '漏斗掉得最多：今天还没有人进站'
  const lost = Math.round(drop.lostShare * 100)
  return `漏斗掉得最多：${STEP_LABELS[drop.from]} → ${STEP_LABELS[drop.to]}，${drop.before} → ${drop.after} 人（掉 ${lost}%）`
}

export function renderBrief(data: BriefData): string {
  const day = beijing(data.window.start, { month: 'long', day: 'numeric' })
  const until = beijing(data.window.end, { hour: '2-digit', minute: '2-digit' })
  return [
    `Shotviva 每日简报 · ${day} 0:00–${until}（北京时间，对比昨天同时段）`,
    pairLine('注册', data.signups, plain, ' 人'),
    pairLine('出图', data.generated, plain, ' 张'),
    pairLine('失败任务', data.failed, plain, ' 个'),
    pairLine('付款', data.payments, plain, ' 笔'),
    pairLine('净收入', data.netRevenue, usd),
    funnelLine(data.funnel),
    `未处理工单：${data.openTickets === null ? UNREAD : `${data.openTickets} 个`}`,
  ].join('\n')
}
