import { afterEach, expect, it, vi } from 'vitest'
import { displaySource, onThumbnailError, onThumbnailLoad, preloadPhoto } from './thumbnail-fallback'

class BrowserImage {
  src = ''
  onerror?: () => void
  onload?: () => void
  getAttribute() { return this.src }
  decode = vi.fn().mockResolvedValue(undefined)
}

function browser() {
  const images: BrowserImage[] = []
  vi.stubGlobal('Image', class extends BrowserImage {
    constructor() { super(); images.push(this) }
  })
  return images
}

afterEach(() => vi.unstubAllGlobals())

it('preloads only a WebP when available', () => {
  const images = browser()
  const send = vi.fn()
  vi.stubGlobal('fetch', send)
  preloadPhoto({ id: 'new', url: '/new-webp', originalUrl: '/new-original', lastUsedAt: '' })
  images[0].onload?.()
  expect(images.map(image => image.src)).toEqual(['/new-webp'])
  expect(send).not.toHaveBeenCalled()
})

it('shares the original and one repair with an editor opened before the WebP is ready', async () => {
  const delivery = Promise.withResolvers<Response>()
  const send = vi.fn().mockReturnValue(delivery.promise)
  vi.stubGlobal('fetch', send)
  const images = browser()
  const source = { id: 'old', kind: 'photo' as const, src: '/old-webp', originalUrl: '/original' }
  preloadPhoto({ id: source.id, url: source.src, originalUrl: source.originalUrl, lastUsedAt: '' })
  images[0].onerror?.()
  expect(images[0].src).toBe(source.originalUrl)
  const editor = new Image()
  editor.src = displaySource(source)
  expect(editor.src).toBe(source.originalUrl)
  onThumbnailLoad(editor, source)
  images[0].onload?.()
  expect(send).toHaveBeenCalledTimes(1)
  expect(send).toHaveBeenCalledWith('/api/admin/test-thumbnail?kind=photo&id=old', expect.objectContaining({ method: 'POST' }))
  delivery.resolve(Response.json({ url: '/new-signature-webp' }))
  await vi.waitFor(() => expect(editor.src).toBe('/new-signature-webp'))
  expect(images[0].src).toBe(editor.src)
  expect(displaySource(source)).toBe(editor.src)
})

it('keeps a usable original on failure and retries on a subsequent view', async () => {
  browser()
  const send = vi.fn().mockResolvedValue(Response.json({}, { status: 503 }))
  vi.stubGlobal('fetch', send)
  const source = { id: 'retry', kind: 'run' as const, src: '/retry-thumb', originalUrl: '/retry-original' }
  const image = new Image()
  image.src = source.src
  onThumbnailError(image, source)
  onThumbnailLoad(image, source)
  await vi.waitFor(() => expect(displaySource(source)).toBe(source.src))
  expect(image.src).toBe(source.originalUrl)
  image.src = displaySource(source)
  onThumbnailError(image, source)
  expect(send).toHaveBeenCalledTimes(2)
})

it('refreshes an expired original through the admin route once', () => {
  browser()
  const source = { id: 'expired', kind: 'run' as const, src: '/expired-thumb', originalUrl: '/expired-original' }
  const image = new Image()
  image.src = source.originalUrl
  onThumbnailError(image, source)
  expect(image.src).toBe('/api/admin/test-thumbnail?kind=run&id=expired')
  onThumbnailError(image, source)
  expect(image.src).toBe('/api/admin/test-thumbnail?kind=run&id=expired')
})
