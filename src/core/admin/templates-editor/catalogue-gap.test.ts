import { describe, expect, it } from 'vitest'

import { catalogueGapText } from './catalogue-gap'

const gap = { templateId: 't', quality: 'high', price: 50, floor: 51, basis: 'p95' as const, samples: 12 }

describe('catalogueGapText', () => {
  it('names the floor and what it rests on', () => {
    expect(catalogueGapText({ ...gap, reason: 'below_floor' })).toBe('1K 售价低于成本下限：需 ≥51 积分（按近 30 天实测 p95，12 张）')
    expect(catalogueGapText({ ...gap, reason: 'below_floor', basis: 'list', samples: 3 })).toBe('1K 售价低于成本下限：需 ≥51 积分（按OpenAI 保守价）')
    expect(catalogueGapText({ ...gap, reason: 'below_floor', floor: null })).toBe('模型无法定价，不能出售')
  })

  it('says the other reasons plainly', () => {
    expect(catalogueGapText({ ...gap, reason: 'sale_closed' })).toBe('未开放销售')
    expect(catalogueGapText({ ...gap, reason: 'route_unsupported' })).toBe('模型不支持 1K')
  })
})
