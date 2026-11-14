import { describe, expect, it } from 'vitest'

import { copyFieldSchema } from '@/core/templates/copy-fields'

import type { CatalogueCopyField, CatalogueTemplate } from '../catalogue/catalogue-template'
import { clearCopy, copyExamples, examplesLeft, isExample, typedCopy } from './copy-examples'
import { memberSwitch } from './member-switch'

const field = (key: string, label: string, example?: string): CatalogueCopyField =>
  ({ key, label, type: 'short', required: false, maxLength: 40, public: false, ...(example ? { example } : {}) })

const fields = [field('venue', '店名', '夜航酒吧'), field('venue_en', '英文店名', 'NIGHT FLIGHT BAR'), field('title', '主标题', 'SNG奖励'),
  field('contact', '电话或微信', '188 0000 1234'), field('prize_1_note', '一等奖备注')]

describe('copy examples', () => {
  it('starts every field that has an example with it, the rest empty', () => {
    expect(copyExamples(fields)).toEqual({ venue: '夜航酒吧', venue_en: 'NIGHT FLIGHT BAR', title: 'SNG奖励', contact: '188 0000 1234' })
  })

  it('greys a value only while it is the example word for word', () => {
    expect(isExample(fields[0]!, '夜航酒吧')).toBe(true)
    expect(isExample(fields[0]!, '金鼎')).toBe(false)
    expect(isExample(fields[4]!, '')).toBe(false)
  })

  it('counts typed text, not the example or blanks, before 全部清空 / 恢复示例', () => {
    const start = copyExamples(fields)
    expect(typedCopy(fields, start)).toBe(false)
    expect(typedCopy(fields, clearCopy(start, ['venue', 'title']))).toBe(false)
    expect(typedCopy(fields, { ...start, title: '周五赛' })).toBe(true)
  })

  it('reminds while the shop, its English name, phone or address is the example', () => {
    const start = copyExamples(fields)
    expect(examplesLeft(fields, start)).toEqual(['店名', '英文店名', '电话或微信'])
    // A new Chinese name over the cover's English one still reminds.
    expect(examplesLeft(fields, { ...start, venue: '金鼎', contact: '139' })).toEqual(['英文店名'])
    expect(examplesLeft(fields, { ...start, venue: '金鼎', venue_en: 'JD', contact: '139' })).toEqual([])
    expect(examplesLeft(fields, clearCopy(start, ['venue', 'venue_en', 'contact']))).toEqual([])
  })
})

describe('series switch with examples', () => {
  const member = (id: string, copyFields: CatalogueCopyField[]) => ({ id, copyFields, photoInput: 'none' }) as unknown as CatalogueTemplate
  const a = member('a', [field('shop', '店名', '小蕨咖啡'), field('headline', '大标题', '你好，秋天！')])
  const b = member('b', [field('shop', '店名', '暖冬小馆'), field('headline', '大标题', '冬日限定')])

  it('swaps untouched examples for the next member\'s and keeps typed text', () => {
    expect(memberSwitch([a, b], 'a', 'b', { shop: '小蕨咖啡', headline: '你好，秋天！' })?.values.copy).toEqual({ shop: '暖冬小馆', headline: '冬日限定' })
    expect(memberSwitch([a, b], 'a', 'b', { shop: '金鼎', headline: '你好，秋天！' })?.values.copy).toEqual({ shop: '金鼎', headline: '冬日限定' })
  })
})

describe('copy field example', () => {
  it('must fit the field and, for a choice, be one of its options', () => {
    expect(copyFieldSchema.safeParse({ key: 'shop', label: 'Shop', maxLength: 4, example: 'Fern Coffee' }).success).toBe(false)
    expect(copyFieldSchema.safeParse({ key: 'shop', label: 'Shop', maxLength: 16, example: 'Fern Coffee' }).success).toBe(true)
    expect(copyFieldSchema.safeParse({ key: 'size', label: 'Size', type: 'select', options: ['S', 'L'], example: 'M' }).success).toBe(false)
  })
})
