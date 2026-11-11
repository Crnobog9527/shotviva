import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Block } from '../analytics/load'
import type { GrowthStats } from '../growth/stats'
import { PEOPLE, PERIOD } from '../growth/test-fixtures'
import { GrowthPanel } from './growth-view'
import type { PeopleState } from './people-state'

const ADMIN = '11111111-1111-4111-8111-111111111111'
const window = { range: '7d' as const, start: PERIOD.since, end: PERIOD.until, prevStart: '2026-10-28T16:00:00.000Z', prevEnd: '2026-11-04T08:00:00.000Z' }
const previous = { ...PERIOD, signups: 9, payers: 1, money: { ...PERIOD.money, net_usd: 30 } }
const stats = (prev = previous): Block<GrowthStats> => ({
  status: 'ok',
  window,
  data: { timezone: 'Asia/Shanghai', admin_ids: [ADMIN], periods: { current: PERIOD, previous: prev } },
})
const ok: PeopleState = { status: 'ok', window, data: { current: PEOPLE, previous: { ...PEOPLE, visitors: 160 } } }
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

function render(people: PeopleState, db = stats()) {
  return text(renderToStaticMarkup(createElement(GrowthPanel, { range: '7d', db, people })))
}

describe('overview panel', () => {
  const html = render(ok)

  it('opens with the one sentence: visitors to sign-ups to first image to paid, then the money', () => {
    expect(html).toContain('近 7 天：320 位访客 → 18 人注册 → 11 人出了第一张图 → 2 人付款')
    expect(html).toContain('本期一共 3 人付款（含老用户），到手 $59.80。')
  })

  it('says who was left out', () => {
    expect(html).toContain('已去掉管理员账号（1 个）、测试站和爬虫')
    expect(html).toMatch(/上传照片 .* 14/)
  })

  it('compares with the previous period in words', () => {
    expect(html).toContain('和上一个 7 天比')
    expect(html).toMatch(/访客 320 多了 100%/)
    expect(html).toMatch(/注册 18 多了 100%/)
  })

  it('shows the previous amount instead of a percentage when it was 0 or less', () => {
    const flat = render(ok, stats({ ...previous, payers: 0, money: { ...previous.money, net_usd: 0 } }))
    expect(flat).toMatch(/付款人数 3 上期 0/)
    expect(flat).toMatch(/到手收入 \$59\.80 上期 \$0\.00/)
    expect(flat).not.toMatch(/到手收入 \$59\.80 多了/)
  })

  it('names the step where new users stopped most', () => {
    expect(html).toContain('新用户卡得最多的一步：「出第一张图」到「看到付费墙」，少了 6 人。')
  })

  it('draws each funnel step with its share of sign-ups and the people lost', () => {
    expect(html).toMatch(/看到付费墙 .* 5 占注册 27\.8% · 少了 6 人/)
    expect(html).toContain('访客里 5.6% 注册了')
    expect(html).toContain('另有 40 次爬虫或机器访问，没有算进访客。')
  })

  it('hides the visitor share when PostHog saw fewer visitors than there were sign-ups', () => {
    const few: PeopleState = { status: 'ok', window, data: { current: { ...PEOPLE, visitors: 5 }, previous: PEOPLE } }
    expect(render(few)).toContain('访客数比注册数还少')
    expect(render(few)).not.toMatch(/访客里 \d/)
  })

  it('shows revenue with the average over USD orders and the split tables', () => {
    expect(html).toMatch(/平均每单 .*\$19\.93/)
    expect(html).toMatch(/自动续费 .* 1 \$30\.00/)
    expect(html).toContain('另有 1 笔非美元订单')
    expect(html).toContain('这段时间没有退款和拒付。')
    expect(html).toContain('拒付输掉的钱不会从这里扣')
  })

})

describe('overview panel without PostHog numbers', () => {
  it('shows the database half while PostHog is still loading', () => {
    const waiting = render({ status: 'loading' })
    expect(waiting).toContain('近 7 天：18 人注册 → 11 人出了第一张图')
    expect(waiting).toContain('正在从 PostHog 读取')
    expect(waiting).toContain('$59.80')
    expect(waiting).not.toContain('卡得最多')
  })

  it('keeps the database half when PostHog is not connected', () => {
    const offline = render({ status: 'unconfigured' })
    expect(offline).toContain('近 7 天：18 人注册 → 11 人出了第一张图')
    expect(offline).not.toContain('位访客')
    expect(offline).toContain('PostHog 还没连上')
    expect(offline).toContain('$59.80')
  })

  it('shows only an error when the database cannot be read', () => {
    const broken = render({ status: 'error' }, { status: 'error' })
    expect(broken).toContain('暂时读不到')
    expect(broken).not.toContain('位访客')
  })
})
