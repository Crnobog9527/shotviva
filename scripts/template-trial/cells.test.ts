import { describe, expect, it } from 'vitest'

import { ProviderError } from '../../src/core/jobs'
import { stored } from '../template-apply/fixtures.test-support'
import { parseBatch } from '../template-apply/schema'
import { batchIdOf, planCells, runIdOf, uuidFrom, type EffectiveModel } from './cells'
import { buildPage } from './page'
import { isDeterministic, readFailure } from './provider-failure'
import { trialsRoot } from './results'

const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const batch = (trial: object) => parseBatch({ templates: [{ id: 'dish', trial }] })
const prompt = (version: number, body = 'SECRET BODY') => ({ styleRefs: [], providerId: null, body, version, modelParams: {} })
const templates = (version = 3, extra = {}) => new Map([['dish', stored('dish', { prompt: prompt(version), ...extra })]])
const photos = new Map([['in/a.jpg', 'a'.repeat(64)], ['in/b.jpg', 'b'.repeat(64)], ['in/c.jpg', 'c'.repeat(64)]])
const defaultModel: EffectiveModel = () => ({ providerId: 'env', model: 'gpt-image-2.6' })
const ids = (trial: object, t = templates(), model = defaultModel) =>
  planCells(batch(trial).templates, t, photos, { model }).cells.map(c => runIdOf(c, 0))

describe('trial cells', () => {
  it('makes n cells per input set with stable, distinct UUID run ids', () => {
    const trial = { inputs: [{ photo: 'in/a.jpg' }, { photo: 'in/b.jpg', fields: { dish: 'soup' } }], n: 2 }
    const { cells } = planCells(batch(trial).templates, templates(), photos, { model: defaultModel })
    expect(cells.map(c => [c.inputIndex, c.k])).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]])
    const first = ids(trial)
    expect(new Set(first).size).toBe(4)
    expect(first.every(id => UUID4.test(id)) && UUID4.test(batchIdOf(cells[0]))).toBe(true)
    expect(ids(trial)).toEqual(first)
    expect(runIdOf(cells[0], 1)).not.toBe(first[0])
  })

  it('keeps run ids when input sets are reordered, added or removed, and tells repeated sets apart', () => {
    const a = { photo: 'in/a.jpg' }
    const b = { photo: 'in/b.jpg' }
    const [idA, idB] = ids({ inputs: [a, b] })
    expect(ids({ inputs: [b, a] })).toEqual([idB, idA])
    expect(ids({ inputs: [{ photo: 'in/c.jpg' }, a, b] }).slice(1)).toEqual([idA, idB])
    expect(ids({ inputs: [b] })).toEqual([idB])
    const twice = ids({ inputs: [a, a] })
    expect(twice[0]).toBe(idA)
    expect(twice[1]).not.toBe(idA)
  })

  it('re-runs a cell when the prompt, the model actually used, quality, input or photo changes', () => {
    const base = ids({ inputs: [{ photo: 'in/a.jpg' }] })[0]
    const one = (t = templates(), model = defaultModel, input: object = { photo: 'in/a.jpg' }) => ids({ inputs: [input] }, t, model)[0]
    expect(one(templates(4))).not.toBe(base)
    expect(one(new Map([['dish', stored('dish', { prompt: prompt(3, 'OTHER BODY') })]]))).not.toBe(base)
    expect(one(templates(), () => ({ providerId: 'env', model: 'gpt-image-3' }))).not.toBe(base)
    expect(one(templates(3, { quality: 'medium' }))).not.toBe(base)
    expect(one(templates(), defaultModel, { photo: 'in/a.jpg', aspectRatio: '4:5' })).not.toBe(base)
    expect(one(templates(), defaultModel, { photo: 'in/c.jpg' })).not.toBe(base)
    expect(one()).toBe(base)
  })

  it('gives two templates with the same content their own run ids', () => {
    const items = parseBatch({ templates: [{ id: 'dish', trial: { inputs: [{}] } }, { id: 'twin', trial: { inputs: [{}] } }] }).templates
    const both = new Map([...templates(), ['twin', { ...templates().get('dish')!, id: 'twin' }]])
    const [a, b] = planCells(items, both, photos, { model: defaultModel }).cells
    expect(runIdOf(a, 0)).not.toBe(runIdOf(b, 0))
  })

  it('honours --only and --n and reports templates that cannot run', () => {
    const items = parseBatch({ templates: [{ id: 'dish', trial: { inputs: [{}] } }, { id: 'ghost', trial: { inputs: [{}] } }] }).templates
    expect(planCells(items, templates(), photos, { only: new Set(['dish']), n: 3, model: defaultModel }).cells).toHaveLength(3)
    expect(planCells(items, templates(), photos, { model: defaultModel }).problems.map(p => p.templateId)).toEqual(['ghost'])
  })

  it('derives v4 UUIDs from any digest', () => {
    expect(uuidFrom('0'.repeat(64))).toMatch(UUID4)
    expect(uuidFrom('f'.repeat(64))).toMatch(UUID4)
  })
})

describe('provider failures', () => {
  const failure = (kind: 'failed' | 'timeout' | 'content_rejected', message: string) => readFailure(new ProviderError(kind, message))
  it('reads the status and code the adapters keep, and only retries what can heal', () => {
    expect(failure('failed', 'openai 402 code=insufficient_quota type=-')).toEqual({ kind: 'failed', status: 402, code: 'insufficient_quota' })
    expect(failure('failed', 'openrouter image request failed (HTTP 400)')).toMatchObject({ status: 400, code: null })
    const deterministic = ['openai 400 code=- type=-', 'openai 401 code=invalid_api_key type=-', 'openai 429 code=insufficient_quota type=-',
      'openrouter image request failed (HTTP 402)']
    for (const message of deterministic) expect(isDeterministic(failure('failed', message))).toBe(true)
    for (const message of ['openai 500 code=- type=-', 'openai 429 code=rate_limit_exceeded type=-', 'openai request failed', 'openrouter image request failed (HTTP 503)']) {
      expect(isDeterministic(failure('failed', message))).toBe(false)
    }
    expect(isDeterministic(failure('timeout', 'openai request aborted at deadline'))).toBe(false)
    expect(isDeterministic(failure('content_rejected', 'openai 400 code=moderation_blocked type=-'))).toBe(true)
    expect(readFailure(new Error('x'))).toBeNull()
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
