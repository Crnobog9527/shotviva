import { describe, expect, it } from 'vitest'

import { templateFieldsSchema } from '@/core/templates'

import { versionPatch } from './version-patch'
import type { AdminTemplate } from '../templates/types'
import { emptyCopyField } from './copy-form-state'

import {
  buildPayload,
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

describe('prompt version selection', () => {
  it.each([true, false])('saves archived prompt content with the currently selected model (historical route available: %s)', available => {
    const values = toFormValues(template)
    const ref = { key: 'style-refs/burger-hero/test.webp', width: 100, height: 100, uploadedAt: template.createdAt }
    const fragments = { previous: { on: 'on', off: 'off' } }
    const patch = versionPatch(values, { version: 1, body: 'Earlier fixture', providerModel: 'model-B',
      providerId: '727176a9-f5b8-4c5d-b180-fe7b15deb01f', styleRefs: [ref],
      modelParams: { quality: 'medium', background: 'transparent', toggles: fragments } }, available)
    expect(buildPayload({ ...values, ...patch }, false, FLOOR)).toMatchObject({ ok: true, payload: {
      revision: { expected: 2, selected: available ? 1 : undefined },
      template: { quality: 'high', creditsCost: template.creditsCost, visibleIn: template.visibleIn },
      prompt: { body: 'Earlier fixture', providerId: template.prompt?.providerId, styleRefs: [ref],
        modelParams: { quality: 'high', toggles: fragments } },
    } })
    expect(patch).not.toHaveProperty('modelParamsJson')
  })
})

it('keeps historical prices distinct from unpriced tiers and opens a tier only on explicit input', () => {
    const values = toFormValues({ ...template, unpricedResolutions: ['3k'] })
    expect(values.credits['3k']).toBe('')
    const persisted = { creditsCost: template.creditsCost, unpricedResolutions: ['3k'] }
    expect(buildPayload(values, false, FLOOR)).toMatchObject({ payload: { template: persisted } })
    const edited = { ...values, credits: { ...values.credits, '3k': '7' } }
    expect(buildPayload(edited, false, FLOOR)).toMatchObject({ payload: { template: { unpricedResolutions: [], creditsCost: { '3k': 7 } } } })
    const limited = { ...FLOOR, resolutions: ['1k','2k'] as const }
    expect(buildPayload(toFormValues(template), false, { ...limited, resolutions: [...limited.resolutions] })).toMatchObject({
      payload: { template: { unpricedResolutions: [], creditsCost: template.creditsCost } },
    })
    expect(buildPayload(toFormValues(template), true, { ...limited, resolutions: [...limited.resolutions] })).toMatchObject({ payload: { template: persisted } })
  })

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
        assignment: { seriesId: null, previousCategory: 'burgers', previousSeriesId: null },
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
  it('sends only filled-in text: the template\'s own and each field card\'s', () => {
    const headline = { ...emptyCopyField(), key: 'headline', label: 'Headline', labelZh: '标题' }
    const price = { ...emptyCopyField(), key: 'price', label: 'Price' }
    expect(toTranslations({ name: ' 促销海报 ', description: '' }, [headline, price])).toEqual({ zh: { name: '促销海报', fields: { headline: { label: '标题' } } } })
    expect(toTranslations({ name: '', description: '' }, [price])).toEqual({})
  })
})

describe('the 用户填写的字段 cards', () => {
  const sized: AdminTemplate = {
    ...template,
    fields: {
      ...template.fields,
      copy: [
        { key: 'size', label: 'Size', type: 'select', options: ['Small', 'Large'], required: true, maxLength: 60, public: false },
        { key: 'guests', label: 'Guests', type: 'number', min: 1, max: 50, help: 'How many', required: false, maxLength: 4, public: true },
      ],
    },
    translations: { zh: { fields: { size: { label: '尺寸', options: { Small: '小' } }, guests: { help: '人数' } } } },
  }

  it('keeps copy out of the JSON box and puts it back, with its Chinese text, on save', () => {
    const values = toFormValues(sized)
    expect(JSON.parse(values.fieldsJson)).not.toHaveProperty('copy')
    expect(values.copyFields[0]).toMatchObject({ key: 'size', type: 'select', labelZh: '尺寸', options: [{ value: 'Small', labelZh: '小' }, { value: 'Large', labelZh: '' }] })
    const result = buildPayload(values, false, FLOOR)
    expect(result).toMatchObject({
      ok: true,
      payload: {
        template: {
          fields: { copy: [
            { key: 'size', type: 'select', label: 'Size', options: ['Small', 'Large'], required: true, public: false },
            { key: 'guests', type: 'number', label: 'Guests', help: 'How many', min: 1, max: 50, maxLength: 4, public: true },
          ] },
          translations: { zh: { fields: { size: { label: '尺寸', options: { Small: '小' } }, guests: { help: '人数' } } } },
        },
      },
    })
    if (result.ok) expect(templateFieldsSchema.safeParse((result.payload.template as { fields: unknown }).fields).success).toBe(true)
  })

  it('reads a field saved before types as private one-line text', () => {
    const old = { ...template, fields: { ...template.fields, copy: [{ key: 'dish', label: 'Dish', required: false, maxLength: 80 }] } } as unknown as AdminTemplate
    expect(toFormValues(old).copyFields[0]).toMatchObject({ type: 'short', maxLength: '80', public: false })
  })

  it.each([
    ['a bad key', { key: 'Bad Key' }],
    ['no English name', { label: ' ' }],
    ['a choice with an empty option', { type: 'select' as const, options: [{ value: 'A', labelZh: '' }, { value: '', labelZh: '' }] }],
    ['a choice with repeated options', { type: 'select' as const, options: [{ value: 'A', labelZh: '' }, { value: 'A', labelZh: '' }] }],
    ['a non-number bound', { type: 'number' as const, min: 'one' }],
    ['a non-integer length', { maxLength: '2.5' }],
  ])('refuses %s before calling the server', (_, patch) => {
    const values = { ...toFormValues(template), copyFields: [{ ...emptyCopyField(), key: 'f', label: 'F', ...patch }] }
    expect(buildPayload(values, false, FLOOR)).toMatchObject({ ok: false })
  })

  it('refuses two fields with the same key', () => {
    const field = { ...emptyCopyField(), key: 'f', label: 'F' }
    expect(buildPayload({ ...toFormValues(template), copyFields: [field, field] }, false, FLOOR)).toMatchObject({ ok: false, message: expect.stringContaining('重复') })
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
