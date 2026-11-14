import { beforeEach, describe, expect, it, vi } from 'vitest'

import { toContent } from './extract-schema'

vi.mock('server-only', () => ({}))
const requireFeature = vi.fn(async () => undefined)
vi.mock('@/core/features', () => ({ requireFeature: (...args: unknown[]) => requireFeature(...(args as [])) }))
const loadGenerationTemplate = vi.fn()
vi.mock('@/core/templates', async (original) => ({ ...(await original<object>()), loadGenerationTemplate: (...args: unknown[]) => loadGenerationTemplate(...args) }))

const { prepareExtract, runExtract } = await import('./run-extract')

const empty = { header: { brand: '', brandEn: '', cup: '', cupEn: '', city: '', title: '', subtitle: '', datetimeLabel: '', datetime: '' },
  prizes: { headline: '', note: '', rows: [] }, sections: [], table: { title: '', titleEn: '', columns: [], rows: [], footnote: '' },
  footer: { phones: [], phonesLabel: '', addressLabel: '', address: '', qrLabel: '' } }

const answer = {
  ...empty,
  header: { ...empty.header, title: '周6大师赛' },
  prizes: { headline: '奖励前3名', note: '', rows: [['冠军', '', '平板电脑'], ['亚军', '智能手表']] },
  table: { title: '', titleEn: '', columns: ['级别', '基础分'], rows: [['1', '100'], ['休息10分钟'], ['2', '200', '9'], ['', '']], footnote: '' },
}

describe('toContent', () => {
  it('turns one-string rows into break rows, fits rows to the columns and drops empty rows and blocks', () => {
    const { content, clipped } = toContent(answer)
    expect(content.table?.rows).toEqual([['1', '100'], { break: '休息10分钟' }, ['2', '200']])
    expect(content.prizes?.rows).toEqual([{ rank: '冠军', rankEn: '', prize: '平板电脑' }, { rank: '亚军', rankEn: '', prize: '智能手表' }])
    expect(toContent({ ...answer, table: { ...answer.table, rows: [['休息10分钟', '']] } }).content.table?.rows).toEqual([{ break: '休息10分钟' }])
    expect(clipped).toEqual([])
    expect(toContent(empty).content).toMatchObject({ prizes: null, table: null, sections: [] })
  })

  it('takes a 时间 line of up to 40 characters as it is', () => {
    const datetime = '2026年11月15日（星期六）下午14:00准时开赛，13:30签到'
    expect(toContent({ ...answer, header: { ...answer.header, datetime } })).toEqual(expect.objectContaining({ clipped: [] }))
  })

  it('cuts values and lists past their limit to fit and names them, instead of failing', () => {
    const long = { ...answer,
      header: { ...answer.header, datetime: '时'.repeat(50), title: '周六大师赛'.repeat(4) },
      prizes: { ...answer.prizes, rows: Array.from({ length: 22 }, (_, i) => [String(i + 1), '', '奖'.repeat(i === 0 ? 45 : 2)]) },
    }
    const { content, clipped } = toContent(long)
    expect(content.header.datetime).toBe('时'.repeat(40))
    expect(content.header.title).toBe('周六大师赛周六大师赛周六大师赛周')
    expect(content.prizes?.rows).toHaveLength(20)
    expect(content.prizes?.rows[0]?.prize).toBe('奖'.repeat(40))
    expect(clipped.sort()).toEqual(['header.datetime', 'header.title', 'prizes.rows', 'prizes.rows.0.prize'].sort())
  })

  it('counts an emoji as one character and never splits one when cutting', () => {
    const fits = toContent({ ...answer, header: { ...answer.header, title: `${'星'.repeat(15)}🏆` } })
    expect(fits).toMatchObject({ content: { header: { title: `${'星'.repeat(15)}🏆` } }, clipped: [] })
    const { content } = toContent({ ...answer, header: { ...answer.header, title: `🏆${'星'.repeat(16)}` } })
    expect(content.header.title).toBe(`🏆${'星'.repeat(15)}`)
  })

  it('still throws on what cutting cannot fix', () => {
    const sections = Array.from({ length: 8 }, () => ({ title: '规则', style: 'plain', lines: Array.from({ length: 10 }, () => '字'.repeat(60)) }))
    expect(() => toContent({ ...answer, sections })).toThrow()
  })
})

const fields = { poster: { kinds: [{ key: 'prizes', name: { en: 'P', zh: 'P' }, blocks: ['header', 'prizes', 'footer'] }] } }

// poster_extractions: the call's row is inserted as pending first, then completed.
function fakeDb(recentCalls = 0) {
  const inserted: Record<string, unknown>[] = []
  const query = { select: () => query, eq: () => query, gte: () => query, limit: async () => ({ data: Array.from({ length: recentCalls }, (_, id) => ({ id })), error: null }) }
  const insert = (row: Record<string, unknown>) => {
    inserted.push({ ...row })
    return { select: () => ({ single: async () => ({ data: { id: inserted.length }, error: null }) }) }
  }
  const update = (change: Record<string, unknown>) => ({ eq: async (_: string, id: number) => { Object.assign(inserted[id - 1]!, change); return { error: null } } })
  const db = { from: () => ({ ...query, insert, update }) }
  return { db: db as never, inserted }
}

const credentials = async () => ({
  tag: 'decision/gpt-6-luna', adapter: 'openai_responses' as const,
  config: { baseUrl: 'https://api.example.test/v1', model: 'gpt-6-luna', apiKey: 'k' },
  prices: { inputTextPerM: 0.2, inputImagePerM: null, outputPerM: 1.6, outputImagePerM: null, cachedInputPerM: null } as never,
})

// The Responses API's event stream: the answer's text in small deltas, cut across chunks the way
// the network delivers them, then response.completed with the usage.
function reply(json: unknown, { chunk = 7, complete = true } = {}) {
  const text = JSON.stringify(json)
  const events = Array.from({ length: Math.ceil(text.length / 20) }, (_, i) => ({ type: 'response.output_text.delta', delta: text.slice(i * 20, i * 20 + 20) }))
  if (complete) events.push({ type: 'response.completed', response: { usage: { input_tokens: 2000, output_tokens: 3000 } } } as never)
  const wire = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
  const bytes = new TextEncoder().encode(wire)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < bytes.length; at += chunk) controller.enqueue(bytes.slice(at, at + chunk))
      controller.close()
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
}

describe('runExtract', () => {
  beforeEach(() => {
    loadGenerationTemplate.mockResolvedValue({ template: { id: 't', fields }, prompt: { modelParams: { poster_extract: { instructions: 'Sort the text.' } } } })
  })

  it('returns the content, flags strings not in the pasted text and records the cost', async () => {
    const { db, inserted } = fakeDb()
    const fetch = vi.fn(async () => reply(answer))
    const text = '周6大师赛 奖励前3名 冠军 平板电脑 级别 基础分 1 100 休息10分钟 2 200'
    const result = await runExtract({ db, credentials, fetch }, { userId: 'u', templateId: 't', text })
    expect(result).toMatchObject({ status: 'ok', unverified: ['prizes.rows.1.rank', 'prizes.rows.1.prize'] })
    expect(inserted[0]).toMatchObject({ status: 'ok', input_tokens: 2000, output_tokens: 3000, cost_usd: 0.0052, input_chars: text.length })
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body))).toMatchObject({ instructions: expect.stringMatching(/^Sort the text\.\n\nAnswer format: /), store: false, stream: true })
  })

  it('reports each block once, in order, as the streamed answer reaches it', async () => {
    const stages: string[] = []
    const prepared = await prepareExtract({ db: fakeDb().db, credentials, fetch: vi.fn(async () => reply(answer, { chunk: 3 })) }, { userId: 'u', templateId: 't', text: '周6大师赛' })
    expect(prepared.kind).toBe('model')
    if (prepared.kind === 'model') await expect(prepared.run((stage) => stages.push(stage))).resolves.toMatchObject({ status: 'ok' })
    expect(stages).toEqual(['header', 'prizes', 'sections', 'table', 'footer'])
  })

  it('sorts a notice laid out the usual way without the model, and records it at no cost', async () => {
    const { db, inserted } = fakeDb()
    const fetch = vi.fn(async () => reply(answer))
    const text = ['星海杯 周六大师赛', '开赛时间 14:00', '', '奖励前2名', '冠军：平板电脑', '亚军：智能手表', '', '赛事安排', '参赛条件：2000赛事分'].join('\n')
    const prepared = await prepareExtract({ db, credentials, fetch }, { userId: 'u', templateId: 't', text })
    expect(prepared).toMatchObject({ kind: 'done', result: { status: 'ok', unverified: [], content: { header: { cup: '星海杯', title: '周六大师赛' } } } })
    expect(fetch).not.toHaveBeenCalled()
    expect(inserted).toEqual([expect.objectContaining({ provider: 'parser', status: 'ok', cost_usd: 0, input_chars: text.length })])
  })

  it('treats a stream that ends without response.completed as a failure', async () => {
    const { db, inserted } = fakeDb()
    const fetch = vi.fn(async () => reply(answer, { complete: false }))
    await expect(runExtract({ db, credentials, fetch }, { userId: 'u', templateId: 't', text: 'x' })).resolves.toEqual({ status: 'failed' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(inserted[0]).toMatchObject({ status: 'failed' })
  })

  it('flags a value cut to fit for review even though the paste contains it', async () => {
    const datetime = '时'.repeat(50)
    const fetch = vi.fn(async () => reply({ ...answer, header: { ...answer.header, datetime } }))
    const text = `周6大师赛 ${datetime} 奖励前3名 冠军 平板电脑 亚军 智能手表 级别 基础分 1 100 休息10分钟 2 200`
    const result = await runExtract({ db: fakeDb().db, credentials, fetch }, { userId: 'u', templateId: 't', text })
    expect(result).toMatchObject({ status: 'ok', unverified: ['header.datetime'], clipped: ['header.datetime'] })
  })

  it('gives up after one retry, records the failure and returns failed', async () => {
    const { db, inserted } = fakeDb()
    const fetch = vi.fn(async () => new Response('busy', { status: 503 }))
    await expect(runExtract({ db, credentials, fetch }, { userId: 'u', templateId: 't', text: 'x' })).resolves.toEqual({ status: 'failed' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(inserted[0]).toMatchObject({ status: 'failed', input_tokens: null })
  })

  it('is unavailable without the template instructions, and refuses past the hourly limit', async () => {
    loadGenerationTemplate.mockResolvedValue({ template: { id: 't', fields }, prompt: { modelParams: {} } })
    await expect(runExtract({ db: fakeDb().db, credentials }, { userId: 'u', templateId: 't', text: 'x' })).resolves.toEqual({ status: 'unavailable' })
    await expect(runExtract({ db: fakeDb(30).db, credentials }, { userId: 'u', templateId: 't', text: 'x' })).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })
})
