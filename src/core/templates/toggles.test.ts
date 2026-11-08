import { describe, expect, it } from 'vitest'

import { templateFieldsSchema, templateTranslationSchema } from './schema'
import { providerParams, toggleFragments, toggleSetupProblems } from './toggles'

const base = { images: { min: 1, max: 1 }, aspectRatios: ['1:1'] }
const toggle = (extra: Record<string, unknown> = {}) => ({ key: 'replate', label: 'Upgrade plating', ...extra })
const parses = (fields: unknown) => templateFieldsSchema.safeParse(fields).success

describe('fields.toggles (T89)', () => {
  it('is optional and defaults to none', () => {
    expect(templateFieldsSchema.parse(base).toggles).toEqual([])
  })

  it('takes up to three toggles, off by default, with an optional confirm dialog', () => {
    const confirm = { title: 'Sure?', body: 'It may differ.', checkbox: 'I understand', accept: 'Turn on' }
    const parsed = templateFieldsSchema.parse({ ...base, toggles: [toggle({ hint: 'Finer tableware', confirm })] })
    expect(parsed.toggles[0]).toEqual({ key: 'replate', label: 'Upgrade plating', hint: 'Finer tableware', default: false, confirm })
    const four = ['a', 'b', 'c', 'd'].map((key) => toggle({ key }))
    expect(parses({ ...base, toggles: four })).toBe(false)
  })

  it('refuses a default of true and an incomplete confirm dialog', () => {
    expect(parses({ ...base, toggles: [toggle({ default: true })] })).toBe(false)
    expect(parses({ ...base, toggles: [toggle({ confirm: { title: 'Sure?' } })] })).toBe(false)
  })

  it('refuses bad, duplicate, copy-clashing and reserved keys', () => {
    expect(parses({ ...base, toggles: [toggle({ key: 'Replate' })] })).toBe(false)
    expect(parses({ ...base, toggles: [toggle(), toggle()] })).toBe(false)
    expect(parses({ ...base, copy: [{ key: 'replate', label: 'Text' }], toggles: [toggle()] })).toBe(false)
    expect(parses({ ...base, toggles: [toggle({ key: 'aspect_ratio' })] })).toBe(false)
  })

  it('takes Chinese label, hint and confirm text per toggle key, blanks dropped', () => {
    const zh = templateTranslationSchema.parse({ fields: { replate: { label: '优化摆盘和器皿', hint: ' ', confirm: { title: '开启前请确认', body: '' } } } })
    expect(zh.fields?.replate).toEqual({ label: '优化摆盘和器皿', confirm: { title: '开启前请确认' } })
  })
})

describe('model_params.toggles (T89)', () => {
  const params = { input_fidelity: 'high', toggles: { replate: { on: 'FAKE-ON', off: 'FAKE-OFF' }, broken: { on: 1 } } }

  it('reads well-formed fragments and keeps them away from the provider', () => {
    expect(toggleFragments(params)).toEqual({ replate: { on: 'FAKE-ON', off: 'FAKE-OFF' } })
    expect(toggleFragments({})).toEqual({})
    expect(providerParams(params)).toEqual({ input_fidelity: 'high' })
  })

  it('refuses a save whose toggle has no placeholder or misses a fragment', () => {
    const [replate] = templateFieldsSchema.parse({ ...base, toggles: [toggle()] }).toggles
    if (!replate) throw new Error('fixture')
    expect(toggleSetupProblems([replate], 'Shot. {{ replate }}', params)).toEqual([])
    expect(toggleSetupProblems([replate], 'Shot.', params)).toHaveLength(1)
    expect(toggleSetupProblems([replate], 'Shot. {{replate}}', { toggles: { replate: { on: 'x', off: ' ' } } })).toHaveLength(1)
    expect(toggleSetupProblems([replate], 'Shot.', {})).toHaveLength(3)
  })
})
