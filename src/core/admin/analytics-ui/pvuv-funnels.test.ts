import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { PvuvFunnelReport, PvuvState } from '../analytics/pvuv-load'
import { PvuvFunnelsPanel } from './pvuv-funnels'

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const render = (state: PvuvState<PvuvFunnelReport[]>) => text(renderToStaticMarkup(createElement(PvuvFunnelsPanel, { state })))
const step = (label: string, visitors: number, convPrev: number | null, lowSample = false) => ({ label, visitors, convPrev, convFirst: null, lowSample })

describe('「漏斗」 from PVUV.ai', () => {
  it('lists each saved funnel with people, share of the step before and low samples marked', () => {
    const html = render({
      status: 'ok',
      data: [
        { id: 'f1', name: '注册漏斗', funnel: { status: 'ok', data: { steps: [step('进站', 500, null), step('上传', 120, 0.24), step('付款', 3, 0.025, true)], sideSteps: [step('看价格', 60, 0.12)], entered: 500, cleanOnly: true } } },
        { id: 'f2', name: 'Broken', funnel: { status: 'failed' } },
      ],
    })
    expect(html).toContain('注册漏斗')
    expect(html).toContain('进入漏斗 500 人 · 只算 PVUV 判为真人的访客')
    expect(html).toMatch(/上传 120 上一步的 24%/)
    expect(html).toMatch(/付款 3 上一步的 2\.5% 样本太少/)
    expect(html).toMatch(/旁支步骤 .* 看价格 60/)
    expect(html).toContain('这个漏斗暂时读不到')
  })

  it('says why instead of showing zeros', () => {
    expect(render({ status: 'unconfigured' })).toContain('还没接 PVUV 读取')
    expect(render({ status: 'failed' })).toContain('PVUV 暂时读不到')
    expect(render({ status: 'ok', data: [] })).toContain('PVUV 里还没有保存的漏斗')
    const empty = render({ status: 'ok', data: [{ id: 'f', name: 'F', funnel: { status: 'ok', data: { steps: [step('a', 0, null)], sideSteps: [], entered: 0, cleanOnly: false } } }] })
    expect(empty).toContain('这段时间还没有人进入这个漏斗')
  })
})
