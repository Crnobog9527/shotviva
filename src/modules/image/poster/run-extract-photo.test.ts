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

// poster_extractions through the charge functions (1523): start makes the pending row and takes
// PRICE credits (an abstract price; the real one is a database setting), refund marks it failed.
const PRICE = 7
function fakeDb(options: { recentCalls?: number; price?: number | null; balance?: number } = {}) {
  const inserted: Record<string, unknown>[] = []
  const refunds: number[] = []
  const query = { eq: () => query, update: () => query }
  const update = (change: Record<string, unknown>) => {
    const chain = { eq: (column: string, value: unknown) => { if (column === 'id') Object.assign(inserted[(value as number) - 1]!, change); return chain }, then: (ok: (v: unknown) => void) => ok({ error: null }) }
    return chain
  }
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'refund_poster_photo') {
      const row = inserted[(args.p_extraction_id as number) - 1]!
      refunds.push(row.credits as number)
      Object.assign(row, { status: 'failed', input_tokens: args.p_input_tokens, output_tokens: args.p_output_tokens })
      return { data: null, error: null }
    }
    const price = options.price === undefined ? PRICE : options.price
    if (price === null) return { data: null, error: { message: 'PRICE_UNSET' } }
    if ((options.recentCalls ?? 0) >= 30) return { data: null, error: { message: 'RATE_LIMITED' } }
    if ((options.balance ?? 100) < price) return { data: null, error: { message: 'CREDITS_INSUFFICIENT' } }
    inserted.push({ source: 'photo', status: 'pending', provider: args.p_provider, credits: price })
    return { data: [{ extraction_id: inserted.length, credits: price }], error: null }
  }
  return { db: { from: () => ({ ...query, update }), rpc } as never, inserted, refunds }
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
    expect(result).toMatchObject({ credits: PRICE })
    expect(inserted[0]).toMatchObject({ source: 'photo', status: 'ok', provider: 'decision/gpt-6-luna', credits: PRICE, input_tokens: 1500, output_tokens: 400, cost_usd: 0.00094 })
  })

  it('reads one photo per page and sorts them as one notice', async () => {
    const { db, inserted } = fakeDb()
    const KEY2 = KEY.replace('22222222-2222', '55555555-5555')
    // The photos are read in parallel, so which call answers first is not fixed: one page with
    // the notice and one blank page read the same in either order.
    let call = 0
    const fetch = vi.fn(async () => reading((call += 1) === 1 ? notice : []))
    const prepared = await preparePhotoExtract(deps(db, fetch), { userId: USER, templateId: 't', inputKeys: [KEY, KEY2] })
    const result = prepared.kind === 'model' ? await prepared.run(() => undefined) : null
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ status: 'ok' })
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ input_tokens: 3000, output_tokens: 800 })
  })

  it('refunds a run that read nothing and says so, so the editor keeps the paste step', async () => {
    const { db, inserted, refunds } = fakeDb()
    const prepared = await preparePhotoExtract(deps(db, vi.fn(async () => reading([]))), { userId: USER, templateId: 't', inputKeys: [KEY] })
    const result = prepared.kind === 'model' ? await prepared.run(() => undefined) : null
    expect(result).toEqual({ status: 'failed', refunded: PRICE })
    expect(inserted[0]).toMatchObject({ source: 'photo', status: 'failed' })
    expect(refunds).toEqual([PRICE])
  })

  it('refuses someone else\'s upload, and counts against the hourly limit', async () => {
    const other = KEY.replace(USER, '33333333-3333-4333-8333-333333333333')
    await expect(preparePhotoExtract(deps(fakeDb().db, vi.fn()), { userId: USER, templateId: 't', inputKeys: [other] })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(preparePhotoExtract(deps(fakeDb({ recentCalls: 30 }).db, vi.fn()), { userId: USER, templateId: 't', inputKeys: [KEY] })).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('charges nothing when no price is set, and refuses a balance that cannot cover it', async () => {
    const fetch = vi.fn()
    await expect(preparePhotoExtract(deps(fakeDb({ price: null }).db, fetch), { userId: USER, templateId: 't', inputKeys: [KEY] })).resolves.toEqual({ kind: 'done', result: { status: 'unavailable' } })
    await expect(preparePhotoExtract(deps(fakeDb({ balance: PRICE - 1 }).db, fetch), { userId: USER, templateId: 't', inputKeys: [KEY] })).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('is unavailable without reading instructions', async () => {
    loadGenerationTemplate.mockResolvedValue({ template: { id: 't', fields }, prompt: { modelParams: { poster_extract: { instructions: 'Sort.' } } } })
    await expect(preparePhotoExtract(deps(fakeDb().db, vi.fn()), { userId: USER, templateId: 't', inputKeys: [KEY] })).resolves.toEqual({ kind: 'done', result: { status: 'unavailable' } })
  })
})
