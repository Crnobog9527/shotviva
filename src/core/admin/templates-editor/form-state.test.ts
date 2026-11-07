import { describe, expect, it } from 'vitest'

import type { AdminTemplate } from '../templates/types'

import {
  buildPayload,
  copyKeys,
  creditProblems,
  emptyFormValues,
  matchesSearch,
  moveId,
  toFormValues,
  toTranslations,
} from './form-state'

const FLOOR = { high: { '1k': 2, '2k': 4, '3k': 6 }, medium: { '1k': 1, '2k': 2, '3k': 3 } }

const template: AdminTemplate = {
  id: 'burger-hero',
  module: 'image',
  name: 'Burger hero',
  description: 'Stacked burger, studio light',
  category: 'burgers',
  categoryInfo: { key: 'burgers', nameEn: 'Burgers', nameZh: '汉堡', introEn: null, introZh: null, cardStyle: 'pair', sortOrder: 70 },
  coverBeforeUrl: null,
  coverAfterUrl: null,
  coverMediaType: 'image',
  coverVideoUrl: null,
  coverPosterUrl: null,
  fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'] },
  quality: 'high',
  creditsCost: { '1k': 3, '2k': 4, '3k': 6 },
  sortOrder: 10,
  isActive: true,
  visibleIn: ['web', 'partner'],
  translations: {},
  featuredRank: null,
  createdAt: '2026-11-05T00:00:00Z',
  updatedAt: '2026-11-05T00:00:00Z',
  prompt: { body: 'FAKE BODY', version: 2, modelParams: { quality: 'high' } },
}

describe('template form state', () => {
  it('round-trips a template into a save payload', () => {
    const result = buildPayload(toFormValues(template), false, FLOOR)
    expect(result).toEqual({
      ok: true,
      payload: {
        isNew: false,
        template: expect.objectContaining({
          id: 'burger-hero',
          description: 'Stacked burger, studio light',
          visibleIn: ['web', 'partner'],
          quality: 'high',
          creditsCost: { '1k': 3, '2k': 4, '3k': 6 },
        }),
        prompt: { body: 'FAKE BODY', modelParams: { quality: 'high' } },
      },
    })
  })

  it('rejects invalid JSON and empty surfaces before calling the server', () => {
    expect(buildPayload({ ...emptyFormValues(), fieldsJson: '{' }, true, FLOOR)).toMatchObject({ ok: false })
    const noSurface = { ...emptyFormValues(), visibleWeb: false, visiblePartner: false }
    expect(buildPayload(noSurface, true, FLOOR)).toMatchObject({ ok: false })
  })

  it('flags credit numbers under the floor of the chosen quality', () => {
    const low = { ...toFormValues(template), credits: { '1k': '1', '2k': '4', '3k': '6' } }
    expect(creditProblems(low, FLOOR)).toEqual({ '1k': '不能低于下限 2' })
    expect(buildPayload(low, false, FLOOR)).toMatchObject({ ok: false, message: expect.stringContaining('Standard') })
    expect(creditProblems({ ...low, quality: 'medium' }, FLOOR)).toEqual({})
    expect(creditProblems({ ...low, credits: { ...low.credits, '2k': '2.5' } }, FLOOR)).toMatchObject({ '2k': '请填正整数' })
  })

  it('moves ids within bounds only', () => {
    expect(moveId(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveId(['a', 'b', 'c'], 2, 1)).toBeNull()
    expect(moveId(['a', 'b', 'c'], 0, -1)).toBeNull()
  })

  it('searches id, name and category', () => {
    expect(matchesSearch(template, 'BURG')).toBe(true)
    expect(matchesSearch(template, 'pizza')).toBe(false)
    expect(matchesSearch(template, ' ')).toBe(true)
    // The category's names, as 分类管理 shows them (T75).
    expect(matchesSearch(template, '汉堡')).toBe(true)
  })
})

describe('Chinese text in the editor (templates.translations)', () => {
  it('lists the copy keys of the JSON being edited', () => {
    expect(copyKeys('{"copy":[{"key":"headline","label":"Headline"},{"key":"price"}]}')).toEqual([
      { key: 'headline', label: 'Headline' },
      { key: 'price', label: 'price' },
    ])
    expect(copyKeys('{ not json')).toEqual([])
  })

  it('sends only filled-in text, only for fields that still exist', () => {
    const zh = {
      name: ' 促销海报 ',
      description: '',
      fields: { headline: { label: '标题', placeholder: '' }, gone: { label: '旧字段', placeholder: '' } },
    }
    expect(toTranslations(zh, ['headline', 'price'])).toEqual({ zh: { name: '促销海报', fields: { headline: { label: '标题' } } } })
    expect(toTranslations({ name: '', description: '', fields: {} }, ['headline'])).toEqual({})
  })
})

describe('the English description (T52)', () => {
  it('starts blank and is always sent, so clearing it clears the stored text', () => {
    expect(emptyFormValues().description).toBe('')
    expect(toFormValues({ ...template, description: null }).description).toBe('')
    const cleared = buildPayload({ ...toFormValues(template), description: '' }, false, FLOOR)
    expect(cleared).toMatchObject({ ok: true, payload: { template: { description: '' } } })
  })
})
