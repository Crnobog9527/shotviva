import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import { AppError } from '../errors'
import { fetchPartnerImage, type FetchLike } from './fetch-image'

const HOSTS = ['graylum.com']
const URL_OK = 'https://graylum.com/files/dish.png'

// ArrayBuffer-backed so it is a valid Response body.
async function pngBytes(width: number, height: number): Promise<Uint8Array<ArrayBuffer>> {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } })
  return new Uint8Array(await image.png().toBuffer()).slice()
}

const respond = (body: BodyInit | null, init: ResponseInit = {}) => vi.fn<FetchLike>(async () => new Response(body, init))

async function codeOf(run: Promise<unknown>): Promise<string | null> {
  try {
    await run
    return null
  } catch (error) {
    return error instanceof AppError ? error.code : 'other'
  }
}

describe('fetchPartnerImage: URL rules (nothing is fetched)', () => {
  it.each([
    ['http', 'http://graylum.com/a.png'],
    ['other host', 'https://evil.example/a.png'],
    ['metadata ip', 'https://169.254.169.254/latest/meta-data'],
    ['localhost', 'https://localhost/a.png'],
    ['port', 'https://graylum.com:444/a.png'],
    ['file scheme', 'file:///etc/passwd'],
  ])('rejects %s', async (_, url) => {
    const fetch = respond(await pngBytes(10, 10))
    expect(await codeOf(fetchPartnerImage(url, { hosts: HOSTS, fetch }))).toBe('INVALID_INPUT')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('fetchPartnerImage: response rules', () => {
  it('refuses to follow redirects', async () => {
    const fetch = respond(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })
    expect(await codeOf(fetchPartnerImage(URL_OK, { hosts: HOSTS, fetch }))).toBe('INVALID_INPUT')
    expect(fetch.mock.calls[0]?.[1].redirect).toBe('manual')
  })

  it('rejects non-200 and network errors', async () => {
    expect(await codeOf(fetchPartnerImage(URL_OK, { hosts: HOSTS, fetch: respond('nope', { status: 404 }) }))).toBe('INVALID_INPUT')
    const broken = vi.fn<FetchLike>(async () => {
      throw new TypeError('fetch failed')
    })
    expect(await codeOf(fetchPartnerImage(URL_OK, { hosts: HOSTS, fetch: broken }))).toBe('INVALID_INPUT')
  })

  it('rejects a declared size over the cap without reading the body', async () => {
    const fetch = respond('x', { headers: { 'content-length': String(30 * 1024 * 1024) } })
    expect(await codeOf(fetchPartnerImage(URL_OK, { hosts: HOSTS, fetch }))).toBe('IMAGE_TOO_LARGE')
  })

  it('stops reading once the body passes the cap, whatever the headers say', async () => {
    const bytes = await pngBytes(64, 64)
    const fetch = respond(bytes)
    expect(await codeOf(fetchPartnerImage(URL_OK, { hosts: HOSTS, fetch, maxBytes: bytes.length - 1 }))).toBe('IMAGE_TOO_LARGE')
  })

  it('rejects bytes that are not a JPEG/PNG/WebP', async () => {
    const fetch = respond('<html>not an image</html>', { headers: { 'content-type': 'image/png' } })
    expect(await codeOf(fetchPartnerImage(URL_OK, { hosts: HOSTS, fetch }))).toBe('IMAGE_UNSUPPORTED')
  })
})

describe('fetchPartnerImage: success', () => {
  it('downsizes to a 2048 long edge JPEG', async () => {
    const out = await fetchPartnerImage(URL_OK, { hosts: HOSTS, fetch: respond(await pngBytes(3000, 1500)) })
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('jpeg')
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(2048)
  })
})
