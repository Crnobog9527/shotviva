import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { AcknowledgeCell, actionFor, type AcknowledgeActions } from './acknowledge-cell'
import { acknowledgeView, type AcknowledgeState } from './acknowledge-view'

// 「标记已知晓」 on the orders page (1881): which action each payment gets.
const at = '2026-11-22T04:13:00Z'
const state = (patch: Partial<AcknowledgeState>): AcknowledgeState => ({ status: 'refunded', acknowledgement: null, openDispute: false, ...patch })
const actions: AcknowledgeActions = { acknowledge: vi.fn(), unacknowledge: vi.fn() }
const render = (s: AcknowledgeState) => renderToStaticMarkup(createElement(AcknowledgeCell, { paymentId: '7', state: s, actions }))

describe('acknowledgeView', () => {
  it('a plainly paid payment gets nothing', () => {
    expect(acknowledgeView(state({ status: 'paid' }))).toEqual({ kind: 'none' })
  })

  it('unmarked, marked, and a mark the payment has moved past', () => {
    expect(acknowledgeView(state({}))).toEqual({ kind: 'unmarked', openDispute: false })
    expect(acknowledgeView(state({ acknowledgement: { at, stale: false } }))).toEqual({ kind: 'marked', at, openDispute: false })
    expect(acknowledgeView(state({ acknowledgement: { at, stale: true } }))).toEqual({ kind: 'stale', openDispute: false })
  })
})

describe('AcknowledgeCell', () => {
  it('offers 「标记已知晓」 on a refund that is not marked, and says it changes no money', () => {
    const html = render(state({}))
    expect(html).toContain('标记已知晓')
    expect(html).toContain('不改退款、积分或付款状态')
    expect(html).not.toContain('撤销')
  })

  it('shows the mark in Beijing time with 「撤销」', () => {
    const html = render(state({ acknowledgement: { at, stale: false } }))
    expect(html).toContain('已知晓 · 2026-11-22 12:13')
    expect(html).toContain('撤销')
    expect(html).not.toContain('>标记已知晓<')
  })

  it('a marked open dispute still says it counts', () => {
    const html = render(state({ status: 'disputed', acknowledgement: { at, stale: false }, openDispute: true }))
    expect(html).toContain('争议未结，仍计入待处理')
    expect(html).toContain('撤销')
  })

  it('a stale mark asks to confirm again', () => {
    const html = render(state({ acknowledgement: { at, stale: true } }))
    expect(html).toContain('标记后状态又变了，需重新确认')
    expect(html).toContain('标记已知晓')
  })

  it('renders nothing on a paid payment', () => {
    expect(render(state({ status: 'paid' }))).toBe('')
  })
})

describe('actionFor', () => {
  it('「撤销」 calls unacknowledge; 「标记已知晓」 (unmarked or stale) calls acknowledge', () => {
    expect(actionFor({ kind: 'marked', at, openDispute: false }, actions)).toBe(actions.unacknowledge)
    expect(actionFor({ kind: 'unmarked', openDispute: true }, actions)).toBe(actions.acknowledge)
    expect(actionFor({ kind: 'stale', openDispute: false }, actions)).toBe(actions.acknowledge)
  })
})
