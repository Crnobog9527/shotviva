import { beforeEach, describe, expect, it, vi } from 'vitest'

import { compressImage } from '@/core/storage/upload'
import { prepareReferenceUpload } from './prepare-upload'

vi.mock('@/core/storage/upload', async (original) => ({
  ...await original<typeof import('@/core/storage/upload')>(),
  compressImage: vi.fn(),
}))

describe('reference upload', () => {
  beforeEach(() => vi.mocked(compressImage).mockReset())

  it('identifies identical encoded images by the same digest', async () => {
    const encoded = new Blob(['abc'], { type: 'image/webp' })
    vi.mocked(compressImage).mockResolvedValue(encoded)
    for (const type of ['image/png', 'image/jpeg']) {
      const file = new Blob([type], { type })
      const prepared = await prepareReferenceUpload(file)
      expect(compressImage).toHaveBeenCalledWith(file, { longEdge: 2048, type: 'image/webp' })
      expect(prepared.body).toBe(encoded)
      expect(prepared.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    }
  })

  it('rejects an unsupported source before decoding', async () => {
    await expect(prepareReferenceUpload(new Blob(['x'], { type: 'image/svg+xml' })))
      .rejects.toMatchObject({ code: 'IMAGE_UNSUPPORTED' })
    expect(compressImage).not.toHaveBeenCalled()
  })

  it('rejects a fallback PNG instead of storing it with a WebP key', async () => {
    const png = new Blob(['x'], { type: 'image/png' })
    vi.mocked(compressImage).mockResolvedValue(png)
    await expect(prepareReferenceUpload(png)).rejects.toMatchObject({ code: 'UPLOAD_FAILED' })
  })
})
