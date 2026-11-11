import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PERIOD } from '../growth/test-fixtures'
import { SourcesSection, type SourcesState } from './sources-section'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const db = {
  ...PERIOD,
  cohort: [A, B],
  cohort_referred: [B],
  buyers: [{ user_id: A, net_usd: 9.9, orders: 1, referred: false }],
}
const window = { range: '7d' as const, start: PERIOD.since, end: PERIOD.until, prevStart: PERIOD.since, prevEnd: PERIOD.since }
const ok: SourcesState = {
  status: 'ok',
  window,
  data: { visitors: { search: 19, ai: 0, social: 1, affiliate: 1, ads: 0, direct: 163, other: 1 }, firstTouch: { [A]: 'search' } },
}
const text = (state: SourcesState) =>
  renderToStaticMarkup(createElement(SourcesSection, { db, state })).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const rowOf = (html: string, label: string) => html.slice(html.lastIndexOf(`${label} `), html.lastIndexOf(`${label} `) + 200)

describe('source table', () => {
  const html = text(ok)

  it('lists every source with visitors, sign-ups, buyers and money', () => {
    expect(rowOf(html, '搜索引擎')).toMatch(/搜索引擎 .* 19 1 1 \$9\.90/)
    expect(rowOf(html, '直接访问')).toMatch(/直接访问 .* 163 0 0 \$0\.00/)
    expect(html).toContain('AI 助手')
    expect(html).toContain('广告')
  })

  it('credits the promoter binding from the database', () => {
    expect(rowOf(html, '推广员链接')).toMatch(/推广员链接 .* 1 1 0 \$0\.00/)
  })

  it('says how people are counted', () => {
    expect(html).toContain('一个人只算进一个来源')
  })

  it('without PostHog shows dashes for visitors and puts non-promoter people under 认不出来', () => {
    const offline = text({ status: 'unconfigured' })
    expect(offline).toContain('除了推广员，其他人都先算在「认不出来」里')
    expect(rowOf(offline, '认不出来')).toMatch(/认不出来 .* — 1 1 \$9\.90/)
  })

  it('says it is still reading while PostHog loads', () => {
    expect(text({ status: 'loading' })).toContain('正在从 PostHog 读取来源')
  })
})
