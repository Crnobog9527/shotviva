import { describe, expect, it, vi } from 'vitest'

import { canShareChunk, fetchChunk, nextChunk, phoneSaveSupported, PHOTO_CHUNK, readPhotoLinks, requestPhotoLinks, shareChunk } from './photo-save'

const link = (n: number) => ({ url: `https://r2.example/${n}`, name: `shop_white_${n}.png` })
const links = (n: number) => Array.from({ length: n }, (_, i) => link(i + 1))
const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init)
const sharer = (canShare: (data?: ShareData) => boolean) => ({ share: () => Promise.resolve(), canShare })

describe('phoneSaveSupported', () => {
  it('saves to photos only on a touch screen whose browser can share files', () => {
    expect(phoneSaveSupported(true, sharer(() => true))).toBe(true)
    expect(phoneSaveSupported(false, sharer(() => true))).toBe(false)
    expect(phoneSaveSupported(true, { share: () => Promise.resolve() })).toBe(false)
    expect(phoneSaveSupported(true, undefined)).toBe(false)
  })
})

describe('nextChunk', () => {
  it('walks a batch of 25 in groups of ten and ends on the remainder', () => {
    const all = links(25)
    const saved = new Set<string>()
    const sizes: number[] = []
    for (let group = nextChunk(all, saved); group.length; group = nextChunk(all, saved)) {
      sizes.push(group.length)
      group.forEach((photo) => saved.add(photo.name))
    }
    expect(sizes).toEqual([10, 10, 5])
  })
  it('resumes after the saved photos when links are fetched again, never from photo 1', () => {
    const saved = new Set(links(10).map((l) => l.name))
    // A fresh set of links (new URLs, same names) as after an expiry.
    const fresh = links(25).map((l) => ({ ...l, url: `${l.url}?again` }))
    const group = nextChunk(fresh, saved)
    expect(group[0].name).toBe('shop_white_11.png')
    expect(group[0].url).toContain('again')
    expect(group).toHaveLength(10)
  })
})

describe('reading the route', () => {
  it('turns a photo list into links', async () => {
    expect(await readPhotoLinks(json({ photos: links(2) }))).toEqual({ kind: 'ready', photos: links(2) })
  })
  it('keeps the ZIP route outcomes: packing, limited, tier and errors', async () => {
    expect(await readPhotoLinks(json({}, { status: 202, headers: { 'Retry-After': '30' } }))).toEqual({ kind: 'packing', retryAfterMs: 30_000 })
    expect(await readPhotoLinks(json({}, { status: 429 }))).toEqual({ kind: 'limited', retryAfterMs: 60_000 })
    expect(await readPhotoLinks(json({ code: 'TIER_REQUIRED', required_tier: 'max' }, { status: 403 }))).toEqual({ kind: 'upgrade', tier: 'max' })
    expect(await readPhotoLinks(json({ photos: [] }))).toEqual({ kind: 'error', code: 'INTERNAL' })
    expect(await readPhotoLinks(json({ photos: [{ url: 1 }] }))).toEqual({ kind: 'error', code: 'INTERNAL' })
  })
  it('asks the batch download route for photos, and reports a dropped connection', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ photos: links(1) }))
    await requestPhotoLinks('b1', fetcher)
    expect(fetcher.mock.calls[0][0]).toBe('/api/generate/batch/b1/download?format=photos')
    expect(await requestPhotoLinks('b1', vi.fn().mockRejectedValue(new Error('offline')))).toEqual({ kind: 'error', code: 'NETWORK' })
  })
})

describe('fetchChunk', () => {
  it('fetches each photo as a File with its name and type, bypassing the HTTP cache', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(new Blob(['x'], { type: 'image/png' }))))
    const files = await fetchChunk(links(2), fetcher)
    expect(files?.map((f) => [f.name, f.type])).toEqual([['shop_white_1.png', 'image/png'], ['shop_white_2.png', 'image/png']])
    expect(fetcher.mock.calls[0][1]).toEqual({ cache: 'no-store' })
  })
  it('falls back to the extension for the type when the response has none', async () => {
    const files = await fetchChunk([{ url: 'u', name: 'a.jpg' }], () => Promise.resolve(new Response(new Blob(['x']))))
    expect(files?.[0].type).toBe('image/jpeg')
  })
  it('is null if any photo fails, so a half group is never offered', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('x')).mockResolvedValueOnce(new Response('no', { status: 403 }))
    expect(await fetchChunk(links(2), fetcher)).toBeNull()
    expect(await fetchChunk(links(1), vi.fn().mockRejectedValue(new TypeError('CORS')))).toBeNull()
  })
})

describe('canShareChunk', () => {
  const files = [new File(['x'], 'a.png', { type: 'image/png' })]
  it('asks with the real files, and treats a throwing browser as no', () => {
    expect(canShareChunk(sharer(() => true), files)).toBe(true)
    expect(canShareChunk(sharer(() => false), files)).toBe(false)
    expect(canShareChunk(sharer(() => { throw new Error('x') }), files)).toBe(false)
    expect(canShareChunk(undefined, files)).toBe(false)
    expect(canShareChunk(sharer(() => true), [])).toBe(false)
  })
})

describe('shareChunk', () => {
  const files = [new File(['x'], 'a.png', { type: 'image/png' })]
  it('is shared when the sheet closes normally', async () => {
    expect(await shareChunk({ share: vi.fn().mockResolvedValue(undefined) }, files)).toBe('shared')
  })
  it('treats cancelling the sheet (AbortError) as not an error', async () => {
    const abort = Object.assign(new Error('cancel'), { name: 'AbortError' })
    expect(await shareChunk({ share: vi.fn().mockRejectedValue(abort) }, files)).toBe('cancelled')
  })
  it('is failed for anything else, such as an expired tap', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    expect(await shareChunk({ share: vi.fn().mockRejectedValue(denied) }, files)).toBe('failed')
  })
})
