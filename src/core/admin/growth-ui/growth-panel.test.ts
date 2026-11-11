import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PEOPLE, PERIOD } from '../growth/test-fixtures'
import type { Overview } from '../growth/load'
import { GrowthPanel } from './growth-view'

const ADMIN = '11111111-1111-4111-8111-111111111111'
const window = { range: '7d' as const, start: PERIOD.since, end: PERIOD.until, prevStart: '2026-10-28T16:00:00.000Z', prevEnd: '2026-11-04T08:00:00.000Z' }
const previous = { ...PERIOD, signups: 9, payers: 1, money: { ...PERIOD.money, net_usd: 30 } }
const db: Overview['db'] = {
  status: 'ok',
  window,
  data: { timezone: 'Asia/Shanghai', admin_ids: [ADMIN], periods: { current: PERIOD, previous } },
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

function render(people: Overview['people']) {
  return text(renderToStaticMarkup(createElement(GrowthPanel, { range: '7d', overview: { db, people } })))
}

describe('overview panel', () => {
  const html = render({ status: 'ok', window, data: { current: PEOPLE, previous: { ...PEOPLE, visitors: 160 } } })

  it('opens with the one sentence: visitors to sign-ups to first image to paid, then the money', () => {
    expect(html).toContain('近 7 天：320 位访客 → 18 人注册 → 11 人出了第一张图 → 2 人付款')
    expect(html).toContain('本期一共 3 人付款（含老用户），到手 $59.80。')
  })

  it('says who was left out', () => {
    expect(html).toContain('已去掉管理员账号（1 个）、测试站和爬虫')
  })

  it('compares with the previous period in words', () => {
    expect(html).toContain('和上一个 7 天比')
    expect(html).toMatch(/访客 320 多了 100%/)
    expect(html).toMatch(/注册 18 多了 100%/)
  })

  it('names the step where new users stopped most', () => {
    expect(html).toContain('新用户卡得最多的一步：「出第一张图」到「看到付费墙」，少了 6 人。')
  })

  it('draws each funnel step with its share of sign-ups and the people lost', () => {
    expect(html).toMatch(/看到付费墙 .* 5 占注册 27\.8% · 少了 6 人/)
    expect(html).toContain('访客里 5.6% 注册了')
    expect(html).toContain('另有 40 次爬虫或机器访问，没有算进访客。')
  })

  it('shows revenue with the average over USD orders and the split tables', () => {
    expect(html).toMatch(/平均每单 .*\$19\.93/)
    expect(html).toMatch(/自动续费 .* 1 \$30\.00/)
    expect(html).toContain('另有 1 笔非美元订单')
    expect(html).toContain('这段时间没有退款和拒付。')
  })

  it('keeps the database half when PostHog is not connected', () => {
    const offline = render({ status: 'unconfigured' })
    expect(offline).toContain('近 7 天：18 人注册 → 11 人出了第一张图')
    expect(offline).not.toContain('位访客')
    expect(offline).toContain('PostHog 还没连上')
    expect(offline).toContain('这一步的数来自 PostHog，现在没有读到')
    expect(offline).toContain('$59.80')
  })

  it('shows only an error when the database cannot be read', () => {
    const broken = text(renderToStaticMarkup(createElement(GrowthPanel, { range: '7d', overview: { db: { status: 'error' }, people: { status: 'error' } } })))
    expect(broken).toContain('暂时读不到')
    expect(broken).not.toContain('位访客')
  })
})
