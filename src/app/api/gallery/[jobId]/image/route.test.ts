import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ARCHITECTURE §9 第 9 条: the switch is asked first; a closed gallery never looks a work up, and
// its 404 may sit in the CDN like any other.
const mocks = vi.hoisted(() => ({ open: false, render: vi.fn() }))

vi.mock('@/core/gallery', () => ({ isGalleryEnabled: async () => mocks.open }))
vi.mock('@/core/gallery/image', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  renderGalleryImage: mocks.render,
}))
vi.mock('@/core/storage', () => ({ r2Store: () => ({}) }))
vi.mock('@/site/site.config', () => ({ site: {} }))
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<object>()), connection: async () => undefined, after: () => undefined }))

const { GET } = await import('./route')

const ID = '11111111-1111-4111-8111-111111111111'
const call = (query: string) => GET(new NextRequest(`http://localhost:3000/api/gallery/${ID}/image${query}`), { params: Promise.resolve({ jobId: ID }) })

describe('GET /api/gallery/[jobId]/image', () => {
  beforeEach(() => {
    mocks.render.mockReset()
    mocks.open = false
  })

  it('answers a closed gallery with a cacheable 404 and no work lookup', async () => {
    const response = await call('?w=960')
    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=60')
    expect(mocks.render).not.toHaveBeenCalled()
  })

  it('serves the image while open, with the ten-minute CDN life; 404 for a work not shown or a bad query', async () => {
    mocks.open = true
    mocks.render.mockResolvedValueOnce(new Uint8Array([1, 2])).mockResolvedValueOnce(null)
    const ok = await call('?w=480')
    expect(ok.status).toBe(200)
    expect(ok.headers.get('Content-Type')).toBe('image/webp')
    expect(ok.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=600')
    expect(mocks.render).toHaveBeenCalledWith(expect.anything(), ID, 480)
    expect((await call('?w=960')).status).toBe(404)
    expect((await call('?w=4000')).status).toBe(404)
    expect(mocks.render).toHaveBeenCalledTimes(2)
  })
})
