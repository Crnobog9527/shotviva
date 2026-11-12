import { describe, expect, it } from 'vitest'

import { planTemplate } from './plan-template'
import { fields, SEEDREAM, state, stored } from './fixtures.test-support'
import { templateItemSchema } from './schema'

const ctx = (db = state()) => ({ state: db, seriesTarget: new Map<string, string | null>(), knownSeries: new Set(['set-a']) })
const item = (input: unknown) => templateItemSchema.parse(input)
const fresh = { id: 'new-one', name: 'New one', category: 'western', fields, creditsCost: { '1k': 40, '2k': 80, '3k': 120 }, prompt: { body: 'Body {{x}}' } }

describe('planTemplate', () => {
  it('creates a new template unpublished under a level-2 category, with the model saved explicitly', () => {
    const plan = planTemplate(item({ ...fresh, model: 'seedream-4' }), ctx(), {})
    expect(plan.problems).toEqual([])
    const [save] = plan.ops
    expect(save).toMatchObject({ op: 'save_template', is_new: true, assignment: { series_id: null } })
    expect(save.template).toMatchObject({ id: 'new-one', category_key: 'western', is_active: false, unpriced_resolutions: ['3k'] })
    expect(save.prompt).toMatchObject({ provider_id: SEEDREAM })
    expect(save).not.toHaveProperty('expected')
  })

  it('keeps stored values for an existing template and only saves what the file changes', () => {
    const db = state([stored('dish', { subcategoryKey: 'western' })])
    expect(planTemplate(item({ id: 'dish' }), ctx(db), {})).toMatchObject({ ops: [], actions: ['无变化'] })
    const plan = planTemplate(item({ id: 'dish', name: 'Renamed' }), ctx(db), {})
    expect(plan.ops[0]).toMatchObject({ expected: 3, assignment: { previous_category: 'western', previous_series_id: null } })
    expect(plan.ops[0].template).toMatchObject({ name: 'Renamed', category_key: 'western', description: 'A description' })
    expect(plan.ops[0].prompt).toMatchObject({ body: 'Prompt body', provider_id: null })
  })

  it('orders unpublish, save, sale and publish, and checks the publish rules on the result', () => {
    const db = state([stored('live', { isActive: true, saleEnabled: true }), stored('draft')])
    const down = planTemplate(item({ id: 'live', publish: false }), ctx(db), {})
    expect(down.problems[0]).toContain('unpublishReason')
    const up = planTemplate(item({ id: 'draft', openSale: true, publish: true, name: 'Draft' }), ctx(db), {})
    expect(up.problems).toEqual([])
    expect(up.ops.map(op => op.op)).toEqual(['save_template', 'set_sale', 'set_active'])
    const blocked = planTemplate(item({ id: 'draft', publish: true }), ctx(db), {})
    expect(blocked.problems.join()).toContain('不能上架')
  })

  it('moves a template into a series by slug and rejects an unknown series', () => {
    const db = state([stored('dish')])
    expect(planTemplate(item({ id: 'dish', series: 'set-a' }), ctx(db), {}).ops[0]).toMatchObject({ series_slug: 'set-a' })
    expect(planTemplate(item({ id: 'dish', series: 'nope' }), ctx(db), {}).problems[0]).toContain('nope')
  })

  it('reports validation problems by message and never sends them', () => {
    const plan = planTemplate(item({ ...fresh, creditsCost: { '1k': 1, '2k': 1, '3k': 1 } }), ctx(), {})
    expect(plan.problems[0]).toContain('积分低于下限')
    expect(planTemplate(item({ id: 'missing-body', name: 'x' }), ctx(), {}).problems[0]).toContain('prompt.body')
    expect(planTemplate(item({ ...fresh, isActive: true }), ctx(), {}).notes[0]).toContain('isActive')
  })

  it('does not set a cover the row already has, and needs a prompt to publish', () => {
    const db = state([stored('dish', { saleEnabled: true }), stored('bare', { saleEnabled: true, prompt: null })])
    const same = { op: 'set_cover' as const, before: 'https://assets.test/covers/x/before.webp', after: 'https://assets.test/covers/x/after.webp' }
    expect(planTemplate(item({ id: 'dish' }), ctx(db), { cover: same }).actions).toEqual(['无变化'])
    expect(planTemplate(item({ id: 'dish' }), ctx(db), { cover: { ...same, after: 'https://assets.test/covers/x/new.webp' } }).ops)
      .toEqual([{ op: 'set_cover', after: 'https://assets.test/covers/x/new.webp', id: 'dish' }])
    expect(planTemplate(item({ id: 'bare', publish: true }), ctx(db), {}).problems.join()).toContain('缺提示词')
    expect(planTemplate(item({ id: 'dish', publish: true }), ctx(db), {}).ops).toEqual([{ op: 'set_active', id: 'dish', active: true }])
  })
})
