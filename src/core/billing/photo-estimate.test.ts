import { describe, expect, it } from 'vitest'

import { photoPrices, photoRange, tierCreditPrices, type PricedTemplate } from './photo-estimate'

const tpl = (standard: number, resolutions?: string[]): PricedTemplate => ({
  creditsCost: { '1k': standard, '2k': standard * 2, '3k': standard * 3 },
  ...(resolutions ? { imageOptions: { resolutions } } : {}),
})

describe('photo estimate from live Standard prices', () => {
  it('skips templates without Standard and unpriced ones', () => {
    expect(tierCreditPrices([tpl(20), tpl(15, ['2k']), tpl(0), tpl(Number.NaN)], '1k')).toEqual([20])
  })

  it('takes the cheapest and the most common price, the dearer one on a tie', () => {
    expect(photoPrices([tpl(20), tpl(20), tpl(15), tpl(30)])).toEqual({ cheapest: 15, common: 20 })
    expect(photoPrices([tpl(15), tpl(20)])).toEqual({ cheapest: 15, common: 20 })
    expect(photoPrices([])).toBeNull()
    expect(photoPrices([tpl(10, ['3k'])])).toBeNull()
  })

  it('divides the monthly credits, rounding down', () => {
    expect(photoRange(1990, { cheapest: 15, common: 20 })).toEqual({ low: 99, high: 132 })
    expect(photoRange(6000, { cheapest: 20, common: 20 })).toEqual({ low: 300, high: 300 })
    expect(photoRange(14000, null)).toBeNull()
    expect(photoRange(0, { cheapest: 15, common: 20 })).toBeNull()
    expect(photoRange(10, { cheapest: 15, common: 20 })).toBeNull()
  })
})
