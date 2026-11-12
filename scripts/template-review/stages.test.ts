import { describe, expect, it } from 'vitest'

import { parseBatch } from '../template-apply/schema'
import { buildPage } from '../template-trial/page'
import { finalizeBatch, reviewState, spentUsd, stageOf, type Progress, type TrialRun } from './stages'

const PICK = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const run = (id: string, version: number, status = 'succeeded', costUsd: number | null = 0.05): TrialRun =>
  ({ id, templateId: 'dish', promptVersion: version, status, costUsd, estimateUsd: 0.07 })
const progress = (extra: Partial<Progress> = {}): Progress => ({ exists: true, active: false, version: 3, runs: [run(PICK, 3)], ...extra })
const item = (extra: object = {}) => parseBatch({ templates: [{ id: 'dish', ...extra }] }).templates[0]
const pass = { review: { status: 'pass', version: 3, pick: PICK } }

describe('review file field', () => {
  it('needs a pick to pass and a prompt version', () => {
    expect(() => item({ review: { status: 'pass', version: 3 } })).toThrow('pick')
    expect(() => item({ review: { status: 'fail' } })).toThrow()
    expect(item({ review: { status: 'fail', version: 3, notes: 'too dark' } }).review?.notes).toBe('too dark')
  })
})

describe('stages', () => {
  it('follows a template from missing to live', () => {
    expect(stageOf(item(), progress({ exists: false }))).toContain('未建')
    expect(stageOf(item(), progress({ runs: [] }))).toContain('待试跑')
    expect(stageOf(item(), progress())).toBe('待评审')
    expect(stageOf(item({ review: { status: 'fail', version: 3 } }), progress())).toContain('不通过')
    expect(stageOf(item(pass), progress())).toContain('待定稿')
    expect(stageOf(item(pass), progress({ active: true }))).toBe('已上架')
  })

  it('treats a review of an older prompt version as stale', () => {
    expect(reviewState(item(pass), 4)).toBe('stale')
    expect(stageOf(item(pass), progress({ version: 4, runs: [run(PICK, 3)] }))).toContain('过期')
    expect(reviewState(item(), 3)).toBe('none')
  })

  it('adds up verified costs only', () => {
    expect(spentUsd([run(PICK, 3, 'succeeded', 0.05), run(OTHER, 3, 'failed', null)])).toBeCloseTo(0.05)
  })
})

describe('finalize', () => {
  const batch = (templates: object[]) => parseBatch({ templates, categories: [{ key: 'x', nameEn: 'X', nameZh: '类' }] })

  it('turns a passed review into cover, sale and publish, and nothing else', () => {
    const { batch: out, problems } = finalizeBatch(batch([{ id: 'dish', name: 'Renamed', prompt: { body: 'SECRET' }, model: 'default', ...pass }]),
      new Map([['dish', progress()]]))
    expect(problems).toEqual([])
    expect(out.categories).toEqual([])
    expect(out.templates).toEqual([{ id: 'dish', cover: { testRun: PICK }, openSale: true, publish: true, model: 'default' }])
  })

  it('keeps an explicit false, and skips failed or stale reviews and templates without one', () => {
    const items = [{ id: 'dish', ...pass, publish: false }, { id: 'old', review: { status: 'pass', version: 2, pick: PICK } },
      { id: 'bad', review: { status: 'fail', version: 3 } }, { id: 'none' }]
    const p = new Map([['dish', progress()], ['old', progress()], ['bad', progress()], ['none', progress()]])
    const { batch: out, skipped } = finalizeBatch(batch(items), p)
    expect(out.templates.map(t => [t.id, t.openSale, t.publish])).toEqual([['dish', true, false]])
    expect(skipped).toEqual(['old：评审已过期', 'bad：评审不通过'])
  })

  it('refuses a pick that is missing, failed, another version\'s or another template\'s', () => {
    for (const runs of [[], [run(PICK, 3, 'failed')], [run(PICK, 2)], [run(OTHER, 3)]]) {
      const { problems } = finalizeBatch(batch([{ id: 'dish', ...pass }]), new Map([['dish', progress({ runs })]]))
      expect(problems).toHaveLength(1)
    }
  })
})

it('shows the verdict and marks the picked result on the review page', () => {
  const items = parseBatch({ templates: [{ id: 'dish', trial: { inputs: [{}] }, review: { status: 'pass', version: 3, pick: PICK, notes: 'good <light>' } }] }).templates
  const state = { version: 1 as const, records: { [PICK]: { runId: PICK, templateId: 'dish', version: 3, inputIndex: 0, k: 0, outcome: 'succeeded' as const,
    costUsd: 0.05, provider: null, durationMs: null, file: 'dish/v3/x.png', at: '' } } }
  const html = buildPage(state, items, '/r/.local/trials', '/r/.local/templates')
  expect(html).toContain('评审（v3）：通过')
  expect(html).toContain('good &lt;light&gt;')
  expect(html).toContain('★ 选为封面')
})
