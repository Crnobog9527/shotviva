import { beforeEach, describe, expect, it, vi } from 'vitest'

import { toContent } from './extract-schema'

vi.mock('server-only', () => ({}))
const requireFeature = vi.fn(async () => undefined)
vi.mock('@/core/features', () => ({ requireFeature: (...args: unknown[]) => requireFeature(...(args as [])) }))
const loadGenerationTemplate = vi.fn()
vi.mock('@/core/templates', async (original) => ({ ...(await original<object>()), loadGenerationTemplate: (...args: unknown[]) => loadGenerationTemplate(...args) }))

const { runExtract } = await import('./run-extract')

const empty = { header: { brand: '', brandEn: '', cup: '', cupEn: '', city: '', title: '', subtitle: '', datetimeLabel: '', datetime: '' },
  prizes: { headline: '', note: '', rows: [] }, sections: [], table: { title: '', titleEn: '', columns: [], rows: [], footnote: '' },
  footer: { phones: [], phonesLabel: '', addressLabel: '', address: '', qrLabel: '' } }

const answer = {
  ...empty,
  header: { ...empty.header, title: '周6大师赛' },
  prizes: { headline: '奖励前3名', note: '', rows: [{ rank: '冠军', rankEn: '', prize: '平板电脑' }, { rank: '亚军', rankEn: '', prize: '智能手表' }] },
  table: { title: '', titleEn: '', columns: ['级别', '基础分'], rows: [{ cells: ['1', '100'], break: '' }, { cells: [], break: '休息10分钟' }, { cells: ['2'], break: '' }], footnote: '' },
}

describe('toContent', () => {
  it('turns break rows into full-width rows, pads short rows and drops empty blocks', () => {
    const content = toContent(answer)
    expect(content.table?.rows).toEqual([['1', '100'], { break: '休息10分钟' }, ['2', '']])
    expect(toContent(empty)).toMatchObject({ prizes: null, table: null, sections: [] })
  })
})

const fields = { poster: { kinds: [{ key: 'prizes', name: { en: 'P', zh: 'P' }, blocks: ['header', 'prizes', 'footer'] }] } }

function fakeDb(recentCalls = 0) {
  const inserted: unknown[] = []
  const query = { select: () => query, eq: () => query, gte: () => query, limit: async () => ({ data: Array.from({ length: recentCalls }, (_, id) => ({ id })), error: null }) }
  const db = { from: () => ({ ...query, insert: async (row: unknown) => { inserted.push(row); return { error: null } } }) }
  return { db: db as never, inserted }
}

const credentials = async () => ({
  tag: 'decision/gpt-6-luna', adapter: 'openai_responses' as const,
  config: { baseUrl: 'https://api.example.test/v1', model: 'gpt-6-luna', apiKey: 'k' },
  prices: { inputTextPerM: 0.2, inputImagePerM: null, outputPerM: 1.6, outputImagePerM: null, cachedInputPerM: null } as never,
})

const reply = (json: unknown) => Response.json({
  output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(json) }] }],
  usage: { input_tokens: 2000, output_tokens: 3000 },
})

describe('runExtract', () => {
  beforeEach(() => {
    loadGenerationTemplate.mockResolvedValue({ template: { id: 't', fields }, prompt: { modelParams: { poster_extract: { instructions: 'Sort the text.' } } } })
  })

  it('returns the content, flags strings not in the pasted text and records the cost', async () => {
    const { db, inserted } = fakeDb()
    const fetch = vi.fn(async () => reply(answer))
    const text = '周6大师赛 奖励前3名 冠军 平板电脑 级别 基础分 1 100 休息10分钟 2'
    const result = await runExtract({ db, credentials, fetch }, { userId: 'u', templateId: 't', text })
    expect(result).toMatchObject({ status: 'ok', unverified: ['prizes.rows.1.rank', 'prizes.rows.1.prize'] })
    expect(inserted[0]).toMatchObject({ status: 'ok', input_tokens: 2000, output_tokens: 3000, cost_usd: 0.0052, input_chars: text.length })
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body))).toMatchObject({ instructions: 'Sort the text.', store: false })
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
