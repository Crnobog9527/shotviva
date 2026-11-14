import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cacheLife = vi.fn()
vi.mock('next/cache', () => ({ cacheLife, cacheTag: () => undefined }))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))

const { logger } = await import('../logger')
const { CATALOGUE_LIFE } = await import('./cached-catalogue')
const { previewOrNone } = await import('./cover-ratio')

const COVER = 'https://shotviva.com/assets/covers/t/after-abc.webp'
const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#c86' } }).png().toBuffer()

// A fetch stand-in: records what it was asked and answers with the given bytes or status.
function deps(answer: { body?: Buffer; status?: number; length?: number }, isCover = true) {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const headers = answer.length !== undefined ? { 'content-length': String(answer.length) } : undefined
    return new Response(answer.body ? new Uint8Array(answer.body) : null, { status: answer.status ?? 200, headers })
  }) as unknown as typeof fetch
  return { calls, deps: { fetch: fetchImpl, isCover: () => isCover } }
}

describe('cover preview for the home generator', () => {
  beforeEach(() => {
    cacheLife.mockClear()
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
  })

  it('reads the shape and makes the first frame from one download, fenced (no redirects, a timeout)', async () => {
    const { calls, deps: d } = deps({ body: await png(300, 200) })
    const preview = await previewOrNone(COVER, true, d)
    expect(preview.ratio).toBe(1.5)
    expect(preview.firstFrame).toMatch(/^data:image\/avif;base64,/)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.init?.redirect).toBe('error')
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal)
    expect(cacheLife).toHaveBeenCalledWith('max')
  })

  it('turns the shape by the EXIF orientation (a portrait shot stored landscape)', async () => {
    const turned = await sharp(await png(300, 200)).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    const preview = await previewOrNone(COVER, false, deps({ body: turned }).deps)
    expect(preview).toEqual({ ratio: 200 / 300, firstFrame: null })
  })

  it('gives no shape, kept an hour, for an empty URL, a URL off the assets base, an HTTP error, a format it cannot read or a file too large', async () => {
    const none = { ratio: null, firstFrame: null }
    expect(await previewOrNone(null, true, deps({}).deps)).toEqual(none)
    const off = deps({ body: await png(10, 10) }, false)
    expect(await previewOrNone('http://10.0.0.1/x.png', true, off.deps)).toEqual(none)
    expect(off.calls).toHaveLength(0)
    expect(await previewOrNone(COVER, true, deps({ status: 500 }).deps)).toEqual(none)
    expect(await previewOrNone(COVER, true, deps({ body: Buffer.from('not an image at all') }).deps)).toEqual(none)
    expect(await previewOrNone(COVER, true, deps({ body: Buffer.from('x'), length: 50 * 1024 * 1024 }).deps)).toEqual(none)
    expect(cacheLife.mock.calls.filter(([life]) => life === CATALOGUE_LIFE)).toHaveLength(4)
  })
})
