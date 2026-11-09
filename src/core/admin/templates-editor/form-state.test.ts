import { describe, expect, it } from 'vitest'

import type { AdminTemplate } from '../templates/types'

import {
  buildPayload,
  copyKeys,
  creditProblems,
  emptyFormValues,
  matchesSearch,
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
  categoryInfo: { key: 'burgers', nameEn: 'Burgers', nameZh: '汉堡', introEn: null, introZh: null, cardStyle: 'pair', sortOrder: 70, isSystem: false },
  coverBeforeUrl: null,
  coverAfterUrl: null,
  coverMediaType: 'image',
  coverVideoUrl: null,
  coverPosterUrl: null,
  coverLocales: {},
  fields: { images: { min: 1, max: 1 }, copy: [], aspectRatios: ['1:1'], toggles: [] },
  quality: 'high',
  creditsCost: { '1k': 3, '2k': 4, '3k': 6 },
  sortOrder: 10,
  isActive: true,
  visibleIn: ['web', 'partner'],
  translations: {},
  featuredRank: null,
  createdAt: '2026-11-05T00:00:00Z',
  updatedAt: '2026-11-05T00:00:00Z',
  prompt: { styleRefs: [], providerId: '328576a9-f5b8-4c5d-b180-fe7b15deb02c', body: 'FAKE BODY', version: 2, modelParams: { quality: 'high' } },
}

describe('template form state', () => {
  it('retains private fragments from an archived version even after a public switch was removed', () => {
    const values = { ...toFormValues(template), selectedVersion: 1,
      restoredParams: { toggles: { old: { on: 'older-on', off: 'older-off' } } } }
    expect(buildPayload(values, false, FLOOR)).toMatchObject({ ok: true, payload: {
      revision: { expected: 2, selected: 1 }, prompt: { modelParams: { quality: 'high', ...values.restoredParams } },
    } })
  })
  it('round-trips a template into a save payload', () => {
    const result = buildPayload(toFormValues(template), false, FLOOR)
    expect(result).toEqual({
      ok: true,
      payload: {
        isNew: false,
        revision: { expected: template.prompt?.version },
        template: expect.objectContaining({
          id: 'burger-hero',
          description: 'Stacked burger, studio light',
          visibleIn: ['web', 'partner'],
          quality: 'high',
          creditsCost: { '1k': 3, '2k': 4, '3k': 6 },
        }),
        prompt: { providerId: template.prompt?.providerId, body: 'FAKE BODY', modelParams: { quality: 'high' } },
      },
    })
  })

  it('saves a new style-only template with zero user photos and the private reference on its first save', () => {
    const ref = { key: 'style-refs/style-only/abcdef00-1234-4567-89ab-0123456789ab.webp', width: 300, height: 200, uploadedAt: '2026-01-01T00:00:00Z' }
    const values = {
      ...emptyFormValues(), id: 'style-only', name: 'Style only', category: 'art', promptBody: 'Unit test',
      fieldsJson: '{"images":{"min":0,"max":0},"copy":[],"aspectRatios":["1:1"]}',
      styleRefsEdited: true, styleRefs: [ref],
    }
    const result = buildPayload(values, true, FLOOR)
    expect(result).toMatchObject({
      ok: true, payload: { isNew: true, template: { fields: { images: { min: 0, max: 0 } } }, prompt: { styleRefs: [ref] } },
    })
    if (result.ok) expect(JSON.stringify(result.payload.template)).not.toContain(ref.key)
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

describe('the 开关 cards (T89)', () => {
  const confirm = { title: 'Sure?', body: 'It may differ.', checkbox: 'I understand', accept: 'Turn on' }
  const toggled: AdminTemplate = {
    ...template,
    fields: { ...template.fields, toggles: [{ key: 'replate', label: 'Upgrade plating', default: false, confirm }] },
    translations: { zh: { fields: { replate: { label: '优化摆盘和器皿', confirm: { title: '开启前请确认' } } } } },
    prompt: { styleRefs: [], providerId: null, body: 'FAKE BODY {{replate}}', version: 3, modelParams: { quality: 'high', toggles: { replate: { on: 'FAKE-ON', off: 'FAKE-OFF' } } } },
  }

  it('keeps toggles out of the JSON boxes and puts them back on save', () => {
    const values = toFormValues(toggled)
    expect(JSON.parse(values.fieldsJson)).not.toHaveProperty('toggles')
    expect(JSON.parse(values.modelParamsJson)).toEqual({ quality: 'high' })
    expect(values.toggles[0]).toMatchObject({ key: 'replate', labelZh: '优化摆盘和器皿', confirm: true, on: 'FAKE-ON', off: 'FAKE-OFF' })
    const result = buildPayload(values, false, FLOOR)
    expect(result).toMatchObject({
      ok: true,
      payload: {
        template: {
          fields: { toggles: [{ key: 'replate', label: 'Upgrade plating', default: false, confirm }] },
          translations: { zh: { fields: { replate: { label: '优化摆盘和器皿', confirm: { title: '开启前请确认' } } } } },
        },
        prompt: { modelParams: { quality: 'high', toggles: { replate: { on: 'FAKE-ON', off: 'FAKE-OFF' } } } },
      },
    })
  })

  it('refuses a toggle without its placeholder or a fragment before calling the server', () => {
    const values = toFormValues(toggled)
    expect(buildPayload({ ...values, promptBody: 'FAKE BODY' }, false, FLOOR).ok).toBe(false)
    const noOff = values.toggles.map((toggle) => ({ ...toggle, off: ' ' }))
    expect(buildPayload({ ...values, toggles: noOff }, false, FLOOR).ok).toBe(false)
  })
})
