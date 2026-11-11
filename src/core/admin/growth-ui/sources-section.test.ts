import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AD_SOURCES, SOURCE_TABLE } from '../growth/source-table'
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
const visitors = { 'search:google': 12, 'search:bing': 8, 'ai:chatgpt': 4, direct: 163, affiliate: 1 }
const ok: SourcesState = { status: 'ok', window, data: { visitors, firstTouch: { [A]: 'search:google' }, truncated: false } }
const markup = (state: SourcesState) => renderToStaticMarkup(createElement(SourcesSection, { db, state }))
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('two-level source table', () => {
  const html = markup(ok)
  const plain = text(html)

  it('shows a group total that opens to each source', () => {
    expect(plain).toMatch(/搜索引擎 .*访客 20 注册 1 付款人数 1 到手收入 \$9\.90/)
    expect(plain).toMatch(/Google 访客 12 注册 1 付款人数 1 到手收入 \$9\.90/)
    expect(plain).toMatch(/Bing 访客 8 注册 0/)
    expect(plain).toMatch(/ChatGPT 访客 4/)
  })

  it('opens the groups that had anything, and keeps empty groups closed', () => {
    const detailsOf = (name: string) => html.slice(html.lastIndexOf('<details', html.indexOf(`>${name}<`)), html.indexOf(`>${name}<`))
    expect(detailsOf('搜索引擎')).toMatch(/^<details open=""/)
    expect(detailsOf('广告')).not.toMatch(/^<details open=""/)
  })

  it('hides sources with nothing behind 显示全部', () => {
    const baidu = html.slice(html.lastIndexOf('<div', html.indexOf('百度')), html.indexOf('百度'))
    expect(baidu).toContain('hidden sm:hidden group-has-[:checked]/sources:flex sm:group-has-[:checked]/sources:grid')
    const google = html.slice(html.lastIndexOf('<div', html.indexOf('>Google<')), html.indexOf('>Google<'))
    expect(google).not.toContain('hidden group-has')
    expect(plain).toMatch(/显示全部（另有 \d+ 个来源这段时间为 0）/)
    expect(html).toContain('type="checkbox"')
  })

  it('counts hidden sources, not rows: an empty group hides each of its sources', () => {
    const size = (group: string) => SOURCE_TABLE.filter((d) => d.group === group).length
    // Search: all but Google and Bing; AI: all but ChatGPT; social and ads: every source; 其他网站.
    const expected = size('search') - 2 + (size('ai') - 1) + size('social') + AD_SOURCES.length + 1
    expect(plain).toContain(`显示全部（另有 ${expected} 个来源这段时间为 0）`)
  })

  it('names what cannot be told apart', () => {
    expect(plain).toContain('AI 概览')
    expect(plain).toContain('Copilot 回答来路是 bing.com')
    expect(plain).toContain('分不出来的几种：Google 的 AI 概览和 AI 模式算在 Google 里')
  })

  it('credits the promoter binding from the database', () => {
    expect(plain).toMatch(/推广员链接 .*访客 1 注册 1 付款人数 0/)
  })

  it('without PostHog shows dashes for visitors and puts non-promoter people under 认不出来', () => {
    const offline = text(markup({ status: 'unconfigured' }))
    expect(offline).toContain('除了推广员，其他人都先算在「认不出来」里')
    expect(offline).toMatch(/认不出来 .*访客 — 注册 1 付款人数 1 到手收入 \$9\.90/)
  })

  it('warns when the first-touch read was cut off, and says it is still reading while loading', () => {
    expect(text(markup({ status: 'ok', window, data: { visitors: {}, firstTouch: {}, truncated: true } }))).toContain('一次只返回了一部分')
    expect(text(markup({ status: 'loading' }))).toContain('正在从 PostHog 读取来源')
  })
})
