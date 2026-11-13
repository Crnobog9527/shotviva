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
    const { content, clipped } = toContent(answer)
    expect(content.table?.rows).toEqual([['1', '100'], { break: '休息10分钟' }, ['2', '']])
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
      prizes: { ...answer.prizes, rows: Array.from({ length: 22 }, (_, i) => ({ rank: String(i + 1), rankEn: '', prize: '奖'.repeat(i === 0 ? 45 : 2) })) },
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

  it('flags a value cut to fit for review even though the paste contains it', async () => {
    const datetime = '时'.repeat(50)
    const fetch = vi.fn(async () => reply({ ...answer, header: { ...answer.header, datetime } }))
    const text = `周6大师赛 ${datetime} 奖励前3名 冠军 平板电脑 亚军 智能手表 级别 基础分 1 100 休息10分钟 2`
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
