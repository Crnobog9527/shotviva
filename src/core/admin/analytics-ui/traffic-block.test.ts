import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

import { loadTraffic } from '../analytics/traffic'
import { windowFor } from '../analytics/range'
import type { Traffic } from '../analytics/traffic'
import type { EdgeData } from '../analytics/edge'
import { EdgeTrafficView } from './edge-traffic'
import { TrafficBlock, TrafficView } from './traffic-block'

const data: Traffic = {
  channels: { google: 3, direct: 1, bing: 0, chatgpt: 0, other: 0, internal: 0 },
  homeEntries: {
    google: { en: 2, zh: 0 }, direct: { en: 0, zh: 1 }, bing: { en: 0, zh: 0 },
    chatgpt: { en: 0, zh: 0 }, other: { en: 0, zh: 0 }, internal: { en: 0, zh: 0 },
  },
  sessions: 4, views: 40, visitors: 2,
  identified: 2, suspected: 0, unknown: 38,
  excluded: { admin: 20, test: 1, nonPublicHost: 17, missing: 0 },
}

it('renders channel shares per session and automation shares per observed view, with both homepage entries', () => {
  const query = { range: '7d', sort: 'views', dim: 'source' } as const
  const window = windowFor(query.range, new Date('2026-11-09T16:00:00Z'))
  const html = renderToStaticMarkup(createElement(TrafficView, { data, query, window }))
  const googleRow = html.split('</tr>').find((row) => row.includes('>Google<'))
  expect(googleRow?.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean)).toEqual(['Google', '3', '75%', '2', '0'])
  expect(html).toContain('2 次（5%）')
  expect(html).toContain('38 次（95%）')
  expect(html).toContain('2026-11-04 00:00 至 2026-11-10 00:00')
  expect(html).toContain('直接访问 / 无可识别来源')
})

const edgeCounts = { requests: 10, verified: 2, suspected: 3, unclassified: 5 }
const snapshot: EdgeData = {
  start: '2026-01-01T00:00:00Z', end: '2026-01-08T00:00:00Z', host: 'shotviva.com',
  firstNonzeroBucket: '2026-01-03T10:00:00Z', lastNonzeroBucket: '2026-01-07T03:00:00Z',
  all: edgeCounts, home: { '/': edgeCounts, '/zh': { requests: 0, verified: 0, suspected: 0, unclassified: 0 } },
  verifiedBots: { example: 2 },
}

it('labels the edge denominator and fixed observation period separately', () => {
  const html = renderToStaticMarkup(createElement(EdgeTrafficView, { result: { source: 'snapshot', reason: 'denied', data: snapshot } }))
  expect(html).toContain('固定观察期')
  expect(html).toContain('Vercel 未授权')
  expect(html).toContain('每行百分比以该行请求数为分母')
  expect(html).toContain('已验证自动服务')
  expect(html).toContain('无法判断')
})

it('shows zero measured counts with undefined shares for an empty observation window', async () => {
  const query = { range: 'today', sort: 'views', dim: 'source' } as const
  const window = windowFor(query.range, new Date('2026-11-10T03:00:00Z'))
  const empty = await loadTraffic(async () => ({ results: [], columns: [] }), window)
  const html = renderToStaticMarkup(createElement(TrafficView, { data: empty, query, window }))
  expect(html).toContain('0 次（—）')
  expect(html).toContain('历史采集完整性未知')
  expect(html).not.toContain('0%')
  expect(html).toContain('2026-11-10 00:00 至 2026-11-10 11:00')
})

it('a failed PostHog read exposes neither artificial zeroes nor query details', async () => {
  const block = await TrafficBlock({ query: { range: '7d', sort: 'views', dim: 'source' }, projectId: 'test', result: Promise.resolve({ status: 'error' }) })
  const html = renderToStaticMarkup(block)
  expect(html).toContain('暂时读不到')
  expect(html).not.toContain('0 次')
  expect(html).not.toContain('open_query')
})

it('shows live edge observations without the fallback message', () => {
  const html = renderToStaticMarkup(createElement(EdgeTrafficView, { result: { source: 'live', reason: null, data: snapshot } }))
  expect(html).toContain('所选观察期')
  expect(html).not.toContain('历史样本')
})

it('does not publish HTTP counts when neither live nor historical evidence is available', () => {
  const html = renderToStaticMarkup(createElement(EdgeTrafficView, { result: { source: 'unknown', reason: 'noCoverage', data: null } }))
  expect(html).toContain('HTTP 请求数与爬虫占比未知')
  expect(html).not.toContain('0%')
  expect(html).not.toContain('<table')
})
