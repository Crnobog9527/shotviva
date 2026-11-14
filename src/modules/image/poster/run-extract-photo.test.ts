import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/core/features', () => ({ requireFeature: async () => undefined }))
const loadGenerationTemplate = vi.fn()
vi.mock('@/core/templates', async (original) => ({ ...(await original<object>()), loadGenerationTemplate: (...args: unknown[]) => loadGenerationTemplate(...args) }))
const loadInputImage = vi.fn()
vi.mock('@/core/storage', async (original) => ({ ...(await original<object>()), loadInputImage: (...args: unknown[]) => loadInputImage(...args) }))

const { preparePhotoExtract } = await import('./run-extract-photo')

const USER = '11111111-1111-4111-8111-111111111111'
const KEY = `inputs/${USER}/22222222-2222-4222-8222-222222222222.jpg`
const fields = { poster: { kinds: [{ key: 'prizes', name: { en: 'P', zh: 'P' }, blocks: ['header', 'prizes', 'footer'] }] } }

function fakeDb(recentCalls = 0) {
  const inserted: Record<string, unknown>[] = []
  const query = { select: () => query, eq: () => query, gte: () => query, limit: async () => ({ data: Array.from({ length: recentCalls }, (_, id) => ({ id })), error: null }) }
  const insert = (row: Record<string, unknown>) => {
    inserted.push({ ...row })
    return { select: () => ({ single: async () => ({ data: { id: inserted.length }, error: null }) }) }
  }
  const update = (change: Record<string, unknown>) => ({ eq: async (_: string, id: number) => { Object.assign(inserted[id - 1]!, change); return { error: null } } })
  return { db: { from: () => ({ ...query, insert, update }) } as never, inserted }
}

const credentials = async () => ({
  tag: 'decision/gpt-6-luna', adapter: 'openai_responses' as const,
  config: { baseUrl: 'https://api.example.test/v1', model: 'gpt-6-luna', apiKey: 'k' },
  prices: { inputTextPerM: 0.2, inputImagePerM: null, outputPerM: 1.6, outputImagePerM: null, cachedInputPerM: null } as never,
})

// The reading call answers as plain JSON (not streamed), like 自动核对.
const reading = (lines: string[]) => new Response(JSON.stringify({
  output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ lines }) }] }],
  usage: { input_tokens: 1500, output_tokens: 400 },
}), { headers: { 'Content-Type': 'application/json' } })

const notice = ['星海杯 周六大师赛', '开赛时间 14:00', '', '奖励前2名', '冠军：平板电脑', '亚军：智能手表', '', '赛事安排', '参赛条件：2000赛事分']

const deps = (db: never, fetch: typeof globalThis.fetch) => ({ db, credentials, fetch, store: () => ({}) as never })

describe('preparePhotoExtract', () => {
  beforeEach(async () => {
    loadGenerationTemplate.mockResolvedValue({ template: { id: 't', fields }, prompt: { modelParams: { poster_extract: { instructions: 'Sort.' }, poster_check: { instructions: 'Read every line.' } } } })
    loadInputImage.mockResolvedValue({ bytes: await sharp({ create: { width: 40, height: 60, channels: 3, background: '#fff' } }).jpeg().toBuffer(), contentType: 'image/jpeg' })
  })

  it('reads the photo with the template reading instructions, then sorts the lines like a paste', async () => {
    const { db, inserted } = fakeDb()
    const fetch = vi.fn(async () => reading(notice))
    const prepared = await preparePhotoExtract(deps(db, fetch), { userId: USER, templateId: 't', inputKeys: [KEY] })
    expect(prepared.kind).toBe('model')
    const result = prepared.kind === 'model' ? await prepared.run(() => undefined) : null
    expect(result).toMatchObject({ status: 'ok', content: { header: { cup: '星海杯' } }, text: notice.join('\n') })
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body).toMatchObject({ instructions: 'Read every line.', input: [{ content: [{ type: 'input_image', detail: 'high' }] }] })
    expect(inserted[0]).toMatchObject({ source: 'photo', status: 'ok', provider: 'decision/gpt-6-luna', input_tokens: 1500, output_tokens: 400, cost_usd: 0.00094 })
  })

  it('reads one photo per page and sorts them as one notice', async () => {
    const { db, inserted } = fakeDb()
    const KEY2 = KEY.replace('22222222-2222', '55555555-5555')
    let call = 0
    const fetch = vi.fn(async () => reading((call += 1) === 1 ? notice.slice(0, 6) : notice.slice(7)))
    const prepared = await preparePhotoExtract(deps(db, fetch), { userId: USER, templateId: 't', inputKeys: [KEY, KEY2] })
    const result = prepared.kind === 'model' ? await prepared.run(() => undefined) : null
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ status: 'ok' })
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ input_tokens: 3000, output_tokens: 800 })
  })

  it('records a failed reading and answers failed, so the editor keeps the paste step', async () => {
    const { db, inserted } = fakeDb()
    const prepared = await preparePhotoExtract(deps(db, vi.fn(async () => reading([]))), { userId: USER, templateId: 't', inputKeys: [KEY] })
    const result = prepared.kind === 'model' ? await prepared.run(() => undefined) : null
    expect(result).toEqual({ status: 'failed' })
    expect(inserted[0]).toMatchObject({ source: 'photo', status: 'failed' })
  })

  it('refuses someone else\'s upload, and counts against the hourly limit', async () => {
    const other = KEY.replace(USER, '33333333-3333-4333-8333-333333333333')
    await expect(preparePhotoExtract(deps(fakeDb().db, vi.fn()), { userId: USER, templateId: 't', inputKeys: [other] })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(preparePhotoExtract(deps(fakeDb(30).db, vi.fn()), { userId: USER, templateId: 't', inputKeys: [KEY] })).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('is unavailable without reading instructions', async () => {
    loadGenerationTemplate.mockResolvedValue({ template: { id: 't', fields }, prompt: { modelParams: { poster_extract: { instructions: 'Sort.' } } } })
    await expect(preparePhotoExtract(deps(fakeDb().db, vi.fn()), { userId: USER, templateId: 't', inputKeys: [KEY] })).resolves.toEqual({ kind: 'done', result: { status: 'unavailable' } })
  })
})
