import { describe, expect, it, vi } from 'vitest'

import { loadResult } from './result-file'

const jpegResponse = () => new Response(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }))

describe('loadResult', () => {
  it('fetches once per result for the photo and Share, bypassing the cache', async () => {
    const fetcher = vi.fn(async () => jpegResponse())
    const [a, b] = await Promise.all([loadResult('/api/files/one', fetcher), loadResult('/api/files/one', fetcher)])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('/api/files/one', { cache: 'no-store' })
    expect(a).toBe(b)
    expect(a?.transparent).toBe(false)
  })

  it('returns null on a blocked or failed fetch and tries again next time', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('Load failed')
    })
    expect(await loadResult('/api/files/two', fetcher)).toBeNull()
    expect(await loadResult('/api/files/two', vi.fn(async () => new Response(null, { status: 404 })))).toBeNull()
    expect(await loadResult('/api/files/two', vi.fn(async () => jpegResponse()))).not.toBeNull()
  })
})
