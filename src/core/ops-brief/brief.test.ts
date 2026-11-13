import { describe, expect, it } from 'vitest'

import { windowFor } from '@/core/admin/analytics/range'

import { biggestDrop, netCents, renderBrief, sumPayments, type BriefData, type PaymentRow } from './brief'

// 2026-11-13 22:00 Beijing = 14:00 UTC, when the cron runs. All figures here are made up.
const now = new Date('2026-11-13T14:00:00Z')
const window = windowFor('today', now)

const pay = (created_at: string, cents: number, extra: Partial<PaymentRow> = {}): PaymentRow => ({
  created_at,
  currency: 'usd',
  amount_total: cents,
  amount_refunded: 0,
  amount_tax: 0,
  ...extra,
})

describe('window', () => {
  it('is Beijing midnight to now, against yesterday up to the same time', () => {
    expect(window).toMatchObject({
      start: '2026-11-12T16:00:00.000Z',
      end: '2026-11-13T14:00:00.000Z',
      prevStart: '2026-11-11T16:00:00.000Z',
      prevEnd: '2026-11-12T14:00:00.000Z',
    })
  })
})

describe('netCents', () => {
  it('follows admin_revenue_stats: refunds and the tax share come off, other currencies count 0', () => {
    expect(netCents(pay('2026-11-13T01:00:00Z', 1000))).toBe(1000)
    expect(netCents(pay('2026-11-13T01:00:00Z', 1000, { amount_refunded: 400 }))).toBe(600)
    expect(netCents(pay('2026-11-13T01:00:00Z', 1100, { amount_tax: 100 }))).toBe(1000)
    // Half refunded: half the tax goes back too.
    expect(netCents(pay('2026-11-13T01:00:00Z', 1100, { amount_tax: 100, amount_refunded: 550 }))).toBe(500)
    expect(netCents(pay('2026-11-13T01:00:00Z', 1000, { currency: 'cny' }))).toBe(0)
    expect(netCents(pay('2026-11-13T01:00:00Z', 0))).toBe(0)
  })
})

describe('sumPayments', () => {
  it('splits rows into today and the same hours yesterday, leaving yesterday evening out', () => {
    const rows = [
      pay('2026-11-13T02:00:00Z', 990),
      pay('2026-11-13T13:59:59Z', 1990, { amount_refunded: 1990 }),
      pay('2026-11-12T03:00:00Z', 490),
      // Yesterday after 22:00 Beijing: outside yesterday's window.
      pay('2026-11-12T15:00:00Z', 9990),
    ]
    expect(sumPayments(rows, window)).toEqual({
      payments: { today: 2, yesterday: 1 },
      netRevenue: { today: 9.9, yesterday: 4.9 },
    })
  })
})

describe('biggestDrop', () => {
  it('picks the step losing the largest share of the step before it', () => {
    expect(biggestDrop([100, 40, 30, 3, 2, 1])).toEqual({ from: 'generate', to: 'paywall', before: 30, after: 3, lostShare: 0.9 })
  })

  it('breaks a tie on people lost, and skips steps nobody reached', () => {
    expect(biggestDrop([10, 5, 0, 0, 0, 0])).toMatchObject({ from: 'upload', to: 'generate', before: 5, after: 0 })
    expect(biggestDrop([20, 0, 0, 0, 0, 0])).toMatchObject({ from: 'visit', to: 'upload', before: 20, after: 0 })
  })

  it('is null when nobody came in', () => {
    expect(biggestDrop([0, 0, 0, 0, 0, 0])).toBeNull()
  })
})

const sample: BriefData = {
  window,
  signups: { today: 3, yesterday: 1 },
  generated: { today: 20, yesterday: 25 },
  failed: { today: 2, yesterday: 2 },
  payments: { today: 1, yesterday: 0 },
  netRevenue: { today: 9.9, yesterday: 0 },
  funnel: [120, 30, 18, 6, 2, 1],
  openTickets: 2,
}

describe('renderBrief', () => {
  it('renders every line in Chinese with yesterday and the change', () => {
    expect(renderBrief(sample)).toBe(
      [
        'Shotviva 每日简报 · 11月13日 0:00–22:00（北京时间，对比昨天同时段）',
        '注册：3 人（昨天 1 人，+2）',
        '出图：20 张（昨天 25 张，−5）',
        '失败任务：2 个（昨天 2 个，持平）',
        '付款：1 笔（昨天 0 笔，+1）',
        '净收入：$9.90（昨天 $0.00，+$9.90）',
        '漏斗掉得最多：进站 → 上传，120 → 30 人（掉 75%）',
        '未处理工单：2 个',
      ].join('\n'),
    )
  })

  it('says which parts could not be read and still renders the rest', () => {
    const text = renderBrief({ ...sample, signups: null, netRevenue: null, funnel: null, openTickets: null })
    expect(text).toContain('注册：暂时读不到')
    expect(text).toContain('净收入：暂时读不到')
    expect(text).toContain('漏斗掉得最多：暂时读不到')
    expect(text).toContain('未处理工单：暂时读不到')
    expect(text).toContain('出图：20 张')
  })

  it('names the missing PostHog key and an empty day plainly', () => {
    expect(renderBrief({ ...sample, funnel: 'unset' })).toContain('漏斗掉得最多：后台还没配 PostHog 只读 key')
    expect(renderBrief({ ...sample, funnel: [0, 0, 0, 0, 0, 0] })).toContain('漏斗掉得最多：今天还没有人进站')
  })
})
