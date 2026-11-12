import { describe, expect, it } from 'vitest'

import { stored } from '../template-apply/fixtures.test-support'
import { parseBatch } from '../template-apply/schema'
import { batchIdOf, planCells, runIdOf, uuidFrom } from './cells'
import { buildPage } from './page'
import { trialsRoot } from './results'

const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const batch = (trial: object) => parseBatch({ templates: [{ id: 'dish', trial }] })
const templates = (version = 3, extra = {}) => new Map([['dish', stored('dish', { prompt: { styleRefs: [], providerId: null, body: 'SECRET BODY', version, modelParams: {} }, ...extra })]])
const photos = new Map([['in/a.jpg', 'a'.repeat(64)], ['in/b.jpg', 'b'.repeat(64)]])

describe('trial cells', () => {
  it('makes n cells per input set with stable, distinct UUID run ids', () => {
    const { cells } = planCells(batch({ inputs: [{ photo: 'in/a.jpg' }, { photo: 'in/b.jpg', fields: { dish: 'soup' } }], n: 2 }).templates, templates(), photos, {})
    expect(cells.map(c => [c.inputIndex, c.k])).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]])
    const ids = cells.map(c => runIdOf(c, 0))
    expect(new Set(ids).size).toBe(4)
    expect(ids.every(id => UUID4.test(id)) && UUID4.test(batchIdOf(cells[0]))).toBe(true)
    const again = planCells(batch({ inputs: [{ photo: 'in/a.jpg' }, { photo: 'in/b.jpg', fields: { dish: 'soup' } }], n: 2 }).templates, templates(), photos, {})
    expect(again.cells.map(c => runIdOf(c, 0))).toEqual(ids)
    expect(runIdOf(cells[0], 1)).not.toBe(ids[0])
  })

  it('re-runs a cell only when the prompt version, model, input or photo changes', () => {
    const plan = (t = templates(), input: object = { photo: 'in/a.jpg' }, p = photos) => runIdOf(planCells(batch({ inputs: [input] }).templates, t, p, {}).cells[0], 0)
    const base = plan()
    expect(plan(templates(4))).not.toBe(base)
    expect(plan(templates(3, { quality: 'medium' }))).not.toBe(base)
    expect(plan(templates(), { photo: 'in/a.jpg', aspectRatio: '4:5' })).not.toBe(base)
    expect(plan(templates(), { photo: 'in/a.jpg' }, new Map([['in/a.jpg', 'c'.repeat(64)]]))).not.toBe(base)
    expect(plan()).toBe(base)
  })

  it('gives two templates with the same content their own run ids', () => {
    const items = parseBatch({ templates: [{ id: 'dish', trial: { inputs: [{}] } }, { id: 'twin', trial: { inputs: [{}] } }] }).templates
    const both = new Map([...templates(), ['twin', { ...templates().get('dish')!, id: 'twin' }]])
    const [a, b] = planCells(items, both, photos, {}).cells
    expect(runIdOf(a, 0)).not.toBe(runIdOf(b, 0))
  })

  it('honours --only and --n and reports templates that cannot run', () => {
    const items = parseBatch({ templates: [{ id: 'dish', trial: { inputs: [{}] } }, { id: 'ghost', trial: { inputs: [{}] } }] }).templates
    expect(planCells(items, templates(), photos, { only: new Set(['dish']), n: 3 }).cells).toHaveLength(3)
    expect(planCells(items, templates(), photos, {}).problems.map(p => p.templateId)).toEqual(['ghost'])
  })

  it('derives v4 UUIDs from any digest', () => {
    expect(uuidFrom('0'.repeat(64))).toMatch(UUID4)
    expect(uuidFrom('f'.repeat(64))).toMatch(UUID4)
  })
})

describe('review page', () => {
  it('escapes text, links images relatively and never contains the prompt', () => {
    const items = parseBatch({ templates: [{ id: 'dish', name: 'Dish <b>', trial: {
      inputs: [{ photo: 'in/a.jpg', fields: { dish: '<script>x</script>' } }], references: ['refs/r1.jpg'] } }] }).templates
    const state = { version: 1 as const, records: { r1: { runId: 'r1', templateId: 'dish', version: 3, inputIndex: 0, k: 0, outcome: 'succeeded' as const,
      costUsd: 0.05, provider: 'uuid/gpt-image-2.6', durationMs: 20000, file: 'dish/v3/r1.png', at: '' } } }
    const html = buildPage(state, items, '/repo/.local/trials', '/repo/.local/templates')
    expect(html).toContain('src="../templates/refs/r1.jpg"')
    expect(html).toContain('src="dish/v3/r1.png"')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('SECRET BODY')
    expect(html).toContain('提示词 v3')
  })

  it('keeps trials next to the batch file in its .local folder', () => {
    expect(trialsRoot('/repo/.local/templates/batch.json')).toBe('/repo/.local/trials')
    expect(() => trialsRoot('/repo/batch.json')).toThrow()
  })
})
