import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import { batchSchema, type TemplateItem } from '../template-apply/schema'
import { buildPage } from '../template-trial/page'
import { planCells, runIdOf, type Cell } from '../template-trial/cells'
import type { TrialState } from '../template-trial/results'
import type { AdminTemplate } from '../../src/core/admin/templates/types'
import { checklistFor, defaultAlpha } from './checklist'
import { judgeAll, judgeJob, jobHash, planJobs, recordOf, type ImageReader, type Job, type JudgeContext } from './judge'
import { judgeSummary, latestByRun, spentUsd, type JudgeLedger } from './ledger'
import { judgeCostUsd, judgeEstimateUsd, readAnswer, requestBody } from './model'
import { alphaCheck, qrCheck, readQr } from './pixels'

const QR = readFileSync(join(__dirname, '../../src/core/poster/fixtures/qr-fixture.png'))
const PRICES = { inputTextPerM: 0.1, inputImagePerM: null, outputPerM: 0.5 }

const png = (alpha = 1) => sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 120, b: 40, alpha } } }).png().toBuffer().then(b => new Uint8Array(b))

const template = (id: string, extra: Partial<AdminTemplate> = {}) => ({
  id, quality: 'medium', fields: { images: { min: 1, max: 1 } }, coverAfterUrl: 'https://assets.test/cover.webp',
  prompt: { version: 3, body: 'private', modelParams: {}, styleRefs: [{ key: `style-refs/${id}/ref.webp` }], providerId: null }, ...extra,
}) as unknown as AdminTemplate

const batchOf = (input: unknown) => batchSchema.parse(input)

// A Responses API answer as the judge line returns it.
function responsesBody(items: { id: string; pass: boolean; reason: string }[], usage = { input_tokens: 6000, output_tokens: 400 }) {
  return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ items }) }] }], usage }
}

function fakeFetch(...bodies: (object | number)[]) {
  return vi.fn(async () => {
    const next = bodies.length > 1 ? bodies.shift()! : bodies[0]
    return typeof next === 'number' ? new Response('nope', { status: next }) : new Response(JSON.stringify(next), { status: 200 })
  })
}

async function setup(options: { bar?: string[]; fetch: ReturnType<typeof fakeFetch>; budget?: number; result?: Uint8Array }) {
  const batch = batchOf({
    judge: { bar: options.bar ?? ['The dish matches the photo.', 'No text was added.'] },
    templates: [{ id: 'cn-a', trial: { inputs: [{ photo: 'dish.jpg', judge: ['The plate is the uploaded one.'] }] } }],
  })
  const templates = new Map([['cn-a', template('cn-a')]])
  const { cells } = planCells(batch.templates, templates, new Map([['dish.jpg', 'f'.repeat(64)]]), { model: () => ({ providerId: 'p', model: 'm' }) })
  const runId = runIdOf(cells[0], 0)
  const state: TrialState = { version: 1, records: { [runId]: { runId, templateId: 'cn-a', version: 3, inputIndex: 0, k: 0, outcome: 'succeeded',
    costUsd: 0.03, provider: 'p/m', durationMs: 1, failure: null, file: 'cn-a/v3/x.png', at: '2026-11-15T00:00:00Z' } } }
  const judged = new Map([['cn-a', { coverAfterUrl: 'https://assets.test/cover.webp', styleRefs: ['style-refs/cn-a/ref.webp'], modelParams: {} }]])
  const { jobs: planned } = planJobs(batch, cells, state, judged)
  const result = options.result ?? await png()
  const job: Job = { ...planned[0], hash: jobHash(result, planned[0].cell, planned[0].sources, planned[0].checklist, 'line') }
  const reader: ImageReader = { file: vi.fn(async () => result), cover: vi.fn(async () => png()), ref: vi.fn(async () => png()) }
  const ledger: JudgeLedger = { version: 1, verdicts: {}, spend: [] }
  const ctx: JudgeContext = { line: { tag: 'line', prices: PRICES, config: { apiKey: 'k', model: 'gpt-x', baseUrl: 'https://judge.test/v1', fetch: options.fetch } },
    images: reader, ledger, budgetUsd: options.budget ?? 1, spentUsd: 0, reservedUsd: 0, sleep: async () => {}, now: () => '2026-11-15T01:00:00Z' }
  return { batch, cells, state, job, ctx, reader, ledger }
}

describe('checklist', () => {
  it('joins the family, template and input items, and turns copy fields into text items when asked', () => {
    const list = checklistFor({ bar: ['A', 'Same'], expectText: true }, { bar: ['B', 'Same'] }, { fields: { title: 'Grand Final', empty: ' ' }, judge: ['C'] }, {})
    expect(list.items.map(i => i.text)).toEqual(['A', 'Same', 'B', 'C', 'The image shows the text "Grand Final" exactly as written, every character correct.'])
    expect(list.items.map(i => i.id)).toEqual(['1', '2', '3', '4', '5'])
    expect(list.alpha).toBe('opaque')
    expect(list.qr).toBeNull()
  })

  it('expects a cut-out only from a template that asks for a transparent background', () => {
    expect(defaultAlpha({ background: 'transparent' })).toBe('transparent')
    expect(defaultAlpha({ background: 'auto' })).toBe('opaque')
    expect(checklistFor({ bar: ['A'], alpha: 'any' }, undefined, {}, { background: 'transparent' }).alpha).toBe('any')
  })

  it('keeps the input set\'s judge items out of the trial hash', () => {
    const items = (judge?: string[]) => batchOf({ templates: [{ id: 'cn-a', trial: { inputs: [{ photo: 'dish.jpg', ...(judge ? { judge } : {}) }] } }] }).templates as TemplateItem[]
    const plan = (judge?: string[]) => planCells(items(judge), new Map([['cn-a', template('cn-a')]]), new Map([['dish.jpg', 'f'.repeat(64)]]), { model: () => ({ providerId: 'p', model: 'm' }) }).cells[0]
    expect(plan(['The plate is kept.']).hash).toBe(plan().hash)
  })
})

describe('pixel checks', () => {
  it('tells an opaque result from a see-through one', async () => {
    expect((await alphaCheck(await png(1), 'opaque'))?.pass).toBe(true)
    expect((await alphaCheck(await png(0.5), 'opaque'))?.pass).toBe(false)
    expect((await alphaCheck(await png(0.5), 'transparent'))?.pass).toBe(true)
    expect(await alphaCheck(await png(0.5), 'any')).toBeNull()
  })

  it('reads a QR code back and compares it', async () => {
    const data = await readQr(QR)
    expect(data).toBeTruthy()
    expect((await qrCheck(QR, data)).pass).toBe(true)
    expect((await qrCheck(QR, 'something else')).pass).toBe(false)
    expect((await qrCheck(await png(), data)).reason).toMatch(/No readable QR/)
    expect((await qrCheck(QR, null)).pass).toBe(false)
  })
})

describe('the model call', () => {
  it('labels each image, sends the checklist, keeps nothing at the provider', async () => {
    const body = await requestBody('gpt-x', [{ role: 'result', label: '', bytes: await png() }, { role: 'input', label: 'dish', bytes: await png() }],
      [{ id: '1', text: 'No text was added.' }]) as { store: boolean; reasoning: { effort: string }; input: { content: { type: string; text?: string; image_url?: string }[] }[] }
    const parts = body.input[0].content
    expect(body.store).toBe(false)
    expect(body.reasoning.effort).toBe('medium')
    expect(parts.map(p => p.type)).toEqual(['input_text', 'input_image', 'input_text', 'input_image', 'input_text'])
    expect(parts[0].text).toMatch(/^Image 1: RESULT/)
    expect(parts[2].text).toMatch(/^Image 2: USER INPUT.*\(dish\)/)
    expect(parts[1].image_url).toMatch(/^data:image\/jpeg;base64,/)
    expect(parts[4].text).toBe('Checklist:\n1. No text was added.')
  })

  it('accepts only an answer for every item', () => {
    const items = [{ id: '1', text: 'a' }, { id: '2', text: 'b' }]
    expect(readAnswer({ items: [{ id: '2', pass: false, reason: 'r2' }, { id: '1.', pass: true, reason: 'r1' }] }, items).map(a => a.pass)).toEqual([true, false])
    expect(() => readAnswer({ items: [{ id: '1', pass: true, reason: 'r' }] }, items)).toThrow('JUDGE_MISSING_ITEM')
    expect(() => readAnswer({ verdict: 'yes' }, items)).toThrow('JUDGE_BAD_ANSWER')
  })

  it('prices tokens and holds a budget above a typical look', () => {
    expect(judgeCostUsd({ inputTokens: 6000, outputTokens: 400 }, PRICES)).toBeCloseTo(0.0008, 6)
    expect(judgeCostUsd(null, PRICES)).toBeNull()
    expect(judgeEstimateUsd(4, PRICES)).toBeGreaterThan(0.0008)
    expect(judgeEstimateUsd(4, PRICES)).toBeLessThan(0.003)
    expect(judgeEstimateUsd(4, { ...PRICES, outputPerM: null })).toBeNull()
  })
})

describe('judging a result', () => {
  it('shows the model the result, the photo, the cover and the reference, and records verdict and spend', async () => {
    const fetch = fakeFetch(responsesBody([{ id: '1', pass: true, reason: 'Same dish.' }, { id: '2', pass: false, reason: 'A menu card was added.' }, { id: '3', pass: true, reason: 'Same plate.' }]))
    const { job, ctx, reader, ledger } = await setup({ fetch })
    const result = await judgeJob(job, ctx)
    expect(result.outcome).toBe('judged')
    expect(result.verdict?.pass).toBe(false)
    expect(result.verdict?.items.map(i => [i.id, i.pass, i.source])).toEqual([['alpha', true, 'pixels'], ['1', true, 'model'], ['2', false, 'model'], ['3', true, 'model']])
    expect(reader.cover).toHaveBeenCalledWith('https://assets.test/cover.webp')
    expect(reader.ref).toHaveBeenCalledWith('style-refs/cn-a/ref.webp')
    const sent = JSON.parse((fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(sent.input[0].content.filter((p: { type: string }) => p.type === 'input_image')).toHaveLength(4)
    expect(JSON.stringify(sent)).not.toContain('private')
    expect(ledger.spend).toEqual([expect.objectContaining({ outcome: 'judged', costUsd: 0.0008 })])
    expect(ctx.spentUsd).toBeCloseTo(0.0008, 6)
  })

  it('reuses the verdict of an unchanged result without calling the model', async () => {
    const fetch = fakeFetch(responsesBody([{ id: '1', pass: true, reason: 'a' }, { id: '2', pass: true, reason: 'b' }, { id: '3', pass: true, reason: 'c' }]))
    const { job, ctx } = await setup({ fetch })
    await judgeJob(job, ctx)
    const again = await judgeJob(job, ctx)
    expect(again.outcome).toBe('reused')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('a different result, checklist or judge model is a new verdict', async () => {
    const { job } = await setup({ fetch: fakeFetch(500) })
    expect(jobHash(await png(0.5), job.cell, job.sources, job.checklist, 'line')).not.toBe(job.hash)
    expect(jobHash(await png(), job.cell, job.sources, { ...job.checklist, items: [] }, 'line')).not.toBe(job.hash)
    expect(jobHash(await png(), job.cell, job.sources, job.checklist, 'other-line')).not.toBe(job.hash)
  })

  it('never starts a look the budget cannot hold', async () => {
    const fetch = fakeFetch(500)
    const { job, ctx, ledger } = await setup({ fetch, budget: 0.0001 })
    expect(await judgeJob(job, ctx)).toMatchObject({ outcome: 'skipped', code: 'RUN_BUDGET_REACHED' })
    expect(fetch).not.toHaveBeenCalled()
    expect(ledger.spend).toEqual([])
  })

  it('retries a provider hiccup once, and counts a failed call at its hold', async () => {
    const fetch = fakeFetch(503, 503)
    const { job, ctx, ledger } = await setup({ fetch })
    expect(await judgeJob(job, ctx)).toMatchObject({ outcome: 'failed', code: 'HTTP_503' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(ledger.spend.map(l => [l.outcome, l.code, l.costUsd])).toEqual([['failed', 'HTTP_503', null], ['failed', 'HTTP_503', null]])
    expect(spentUsd(ledger)).toBeCloseTo(2 * ledger.spend[0].estimateUsd, 9)
    expect(ledger.verdicts).toEqual({})
  })

  it('does not retry a request the provider refuses', async () => {
    const fetch = fakeFetch(400)
    const { job, ctx } = await setup({ fetch })
    expect(await judgeJob(job, ctx)).toMatchObject({ outcome: 'failed', code: 'HTTP_400' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('checks only the pixels, for free, when there are no checklist items', async () => {
    const fetch = fakeFetch(500)
    const { job, ctx } = await setup({ fetch, result: await png(0.5) })
    const pixelsOnly = { ...job, checklist: { ...job.checklist, items: [] } }
    const [result] = await judgeAll([pixelsOnly], ctx, 2)
    expect(result.verdict).toMatchObject({ pass: false, model: null, costUsd: 0 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('judges only cells with a downloaded result of the current version', async () => {
    const { batch, cells, state } = await setup({ fetch: fakeFetch(500) })
    const empty: TrialState = { version: 1, records: {} }
    const judged = new Map([['cn-a', { coverAfterUrl: null, styleRefs: [], modelParams: {} }]])
    expect(planJobs(batch, cells, empty, judged)).toMatchObject({ jobs: [], missing: [cells[0]] })
    const failed = structuredClone(state)
    Object.values(failed.records)[0].outcome = 'failed'
    expect(recordOf(cells[0] as Cell, failed)).toBeNull()
    expect(planJobs(batch, cells, state, judged).jobs[0].sources).toMatchObject({ cover: null, refs: [], inputs: [{ label: 'photo', path: 'dish.jpg' }] })
  })
})

describe('where verdicts show', () => {
  it('puts each item with its reason under the result on the review page, and sums them for status', async () => {
    const fetch = fakeFetch(responsesBody([{ id: '1', pass: true, reason: 'Same dish.' }, { id: '2', pass: false, reason: 'A <menu> card.' }, { id: '3', pass: true, reason: 'ok' }]))
    const { batch, state, job, ctx, ledger } = await setup({ fetch })
    await judgeJob(job, ctx)
    const latest = latestByRun(ledger)
    const html = buildPage(state, batch.templates, '/r/.local/trials', '/r/.local/templates', new Date(0), latest)
    expect(html).toContain('评审机 ✗ 1/4 项不过')
    expect(html).toContain('✗ No text was added.<br><span>A &lt;menu&gt; card.</span>')
    expect(html).toContain('✓ The dish matches the photo.')
    expect(judgeSummary([job.record.runId, 'other'], latest)).toBe('✓0 ✗1 未判 1')
    expect(judgeSummary([], latest)).toBe('无结果')
  })
})
