import { createElement } from 'react'
import { renderToReadableStream } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

import { AnalyticsView } from './analytics-view'

const reads = vi.hoisted(() => ({
  traffic: vi.fn(), funnel: vi.fn(), edge: vi.fn(),
  lower: vi.fn().mockResolvedValue({ status: 'error' }),
}))
vi.mock('../analytics/load', () => ({
  funnelEnd: () => 600_000, readTraffic: reads.traffic,
  readPages: reads.lower, readPayment: reads.lower, readActivation: reads.lower, readProblems: reads.lower,
}))
vi.mock('../analytics/funnel-response', () => ({ funnelResponse: reads.funnel }))
vi.mock('../analytics/edge', () => ({ readEdge: reads.edge }))
vi.mock('./templates-block', () => ({ TemplatesBlock: async () => { await reads.lower(); return null } }))

it('streams the priority blocks first and releases every lower block even after failed initial reads', async () => {
  const traffic = Promise.withResolvers<{ status: 'error' }>()
  const funnel = Promise.withResolvers<null>()
  reads.traffic.mockReturnValue(traffic.promise)
  reads.funnel.mockReturnValue(funnel.promise)
  reads.edge.mockResolvedValue({ source: 'unknown', reason: 'unconfigured', data: null })

  const stream = await renderToReadableStream(createElement(AnalyticsView, {
    query: { dim: 'source', range: '7d', sort: 'views' }, projectId: 'test', giftCredits: 1,
  }))
  expect(reads.traffic.mock.calls).toEqual([['7d', 600_000]])
  expect(reads.funnel.mock.calls).toEqual([['test', '7d', 'source', 600_000]])
  expect(reads.edge).toHaveBeenCalledOnce()
  expect(reads.lower).not.toHaveBeenCalled()
  traffic.resolve({ status: 'error' })
  await traffic.promise
  expect(reads.lower).not.toHaveBeenCalled()
  funnel.resolve(null)

  await stream.allReady
  expect(reads.lower).toHaveBeenCalledTimes(5)
})
