import { describe, expect, it, vi } from 'vitest'

import { createMemoryMarkers } from '../../../tests/fakes/memory-markers'
import { createBackoff } from './backoff'
import { createDedupe } from './dedupe'
import { checkSaleFloorWith, type NotifyDeps } from './notify'
import { parseSaleFloorHidden, saleFloorAlert } from './sale-floor'
import { renderAlert } from './templates'

vi.mock('../analytics/capture-error', () => ({ captureError: vi.fn() }))

const below = (id: string, floor = 51) => ({
  template_id: id, quality: 'high', price: 50, route: 'p/gpt-image-2.6-sunburst', reason: 'below_floor',
  floor: { usd: 0.5, basis: 'p95', samples: 12, credits: floor },
})
const closed = (id: string) => ({ template_id: id, quality: 'medium', price: 74, route: null, reason: 'sale_closed', floor: null })

describe('parseSaleFloorHidden', () => {
  it('reads the report rows and drops anything it does not understand', () => {
    expect(parseSaleFloorHidden([below('a'), closed('b'), { template_id: 'c', reason: 'weird' }, null, 'x'])).toEqual([
      { templateId: 'a', reason: 'below_floor', quality: 'high', price: 50, floor: 51, basis: 'p95', samples: 12 },
      { templateId: 'b', reason: 'sale_closed', quality: 'medium', price: 74, floor: null, basis: null, samples: null },
    ])
    expect(parseSaleFloorHidden(null)).toEqual([])
  })
})

describe('saleFloorAlert', () => {
  it('is null when nothing is hidden', () => {
    expect(saleFloorAlert([])).toBeNull()
  })

  it('names the set by ids and reasons, not by the floor numbers, whatever the order', () => {
    const one = saleFloorAlert(parseSaleFloorHidden([below('a', 51), below('b')]))!
    const moved = saleFloorAlert(parseSaleFloorHidden([below('b'), below('a', 52)]))!
    const grown = saleFloorAlert(parseSaleFloorHidden([below('a'), below('b'), below('c')]))!
    expect(moved.fingerprint).toBe(one.fingerprint)
    expect(grown.fingerprint).not.toBe(one.fingerprint)
  })

  it('counts all, puts floor examples first and keeps five', () => {
    const rows = parseSaleFloorHidden([closed('a0'), ...['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id) => below(id))])
    const alert = saleFloorAlert(rows)!
    expect(alert).toMatchObject({ total: 7, belowFloor: 6 })
    expect(alert.examples.map((e) => e.templateId)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5'])
  })

  it('reads as one plain-Chinese message with the floor and what it rests on', () => {
    const alert = saleFloorAlert(parseSaleFloorHidden([below('food-a'), closed('food-b')]))!
    const { sentence, link } = renderAlert(alert, { who: null, origin: 'https://shotviva.com', testSite: false })
    expect(sentence).toBe(
      '【模板不在创作页】已上架的 2 个模板现在没有显示，其中 1 个是 1K 售价低于成本下限。例如：' +
      'food-a（high，售价 50 积分，底价 51 积分，按近 30 天实测 p95 12 张）；food-b（未开放销售）。' +
      '用户看不到也买不了这些模板，请到后台模板页处理（改价，或走价格批准）。',
    )
    expect(link).toBe('去后台看：https://shotviva.com/admin/templates')
  })
})

describe('checkSaleFloorWith', () => {
  function setup(report: unknown) {
    const time = { now: Date.parse('2026-11-12T12:00:00Z') }
    const now = () => time.now
    const { store } = createMemoryMarkers(now)
    const rpc = vi.fn(() => ({ abortSignal: async () => ({ data: report, error: null }) }))
    const fetch = vi.fn(async () => new Response(JSON.stringify({ code: 0, msg: 'success', data: {} })))
    const deps: NotifyDeps = {
      config: { webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/test-hook', secret: 'demo-secret' },
      db: () => ({ rpc }) as never,
      dedupe: createDedupe(() => store, now),
      backoff: createBackoff(),
      feishu: { fetch: fetch as never, now },
      origin: 'https://shotviva.com',
      testSite: false,
      sentryUrl: '',
      now,
      sleep: async () => undefined,
      lastSpikeCheck: { at: 0 },
    }
    return { deps, rpc, fetch, time }
  }

  it('alerts once per hidden set, again a day later, and reads at most every 10 minutes', async () => {
    const { deps, rpc, fetch, time } = setup([below('a')])
    expect(await checkSaleFloorWith(deps)).toBe(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(await checkSaleFloorWith(deps)).toBeNull() // throttled: no read
    expect(rpc).toHaveBeenCalledTimes(1)
    time.now += 10 * 60_000
    expect(await checkSaleFloorWith(deps)).toBe(1)
    expect(fetch).toHaveBeenCalledTimes(1) // same set: not sent again
    time.now += 24 * 60 * 60_000
    await checkSaleFloorWith(deps, { force: true })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('sends nothing when every published template is listed, and nothing without Feishu', async () => {
    const { deps, fetch, rpc } = setup([])
    expect(await checkSaleFloorWith(deps, { force: true })).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
    expect(await checkSaleFloorWith({ ...deps, config: null }, { force: true })).toBeNull()
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
