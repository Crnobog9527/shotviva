import { describe, expect, it, vi } from 'vitest'

import { targetSize } from './compress-image'
import { uploadPhoto, type UploadDeps } from './upload-photo'

const blob = (size: number, type: string) => new Blob([new Uint8Array(size)], { type })

function deps(overrides: Partial<UploadDeps> = {}) {
  return {
    compress: vi.fn(async () => blob(1_200_000, 'image/jpeg')),
    requestTicket: vi.fn(async () => ({ input_key: 'inputs/u/k.jpg', put_url: 'https://r2/put', headers: { 'Content-Type': 'image/jpeg' } })),
    put: vi.fn(async (_u: string, _b: Blob, _h: Record<string, string>, onProgress: (f: number) => void) => onProgress(0.5)),
    track: vi.fn<UploadDeps['track']>(),
    ...overrides,
  }
}

const callbacks = () => ({ onPhase: vi.fn(), onProgress: vi.fn() })

describe('targetSize', () => {
  it('caps the long edge at 2048 and never enlarges', () => {
    expect(targetSize(8064, 6048)).toEqual({ width: 2048, height: 1536 })
    expect(targetSize(3024, 4032)).toEqual({ width: 1536, height: 2048 })
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 })
  })
})

describe('uploadPhoto', () => {
  it('compresses, then PUTs the JPEG with progress through Compressing → Uploading', async () => {
    const d = deps()
    const cb = callbacks()
    await expect(uploadPhoto(blob(18_000_000, 'image/jpeg'), d, cb)).resolves.toBe('inputs/u/k.jpg')
    expect(cb.onPhase.mock.calls.map(([phase]) => phase)).toEqual(['compressing', 'uploading'])
    expect(d.requestTicket).toHaveBeenCalledWith('image/jpeg', 1_200_000)
    expect(cb.onProgress).toHaveBeenLastCalledWith(1)
    // The picked photo's size bucket, not the re-encoded body's.
    expect(d.track).toHaveBeenCalledExactlyOnceWith({ size_bucket: '>5MB', compressed: true })
  })

  it('falls back to the original file when compression fails', async () => {
    const d = deps({ compress: vi.fn(async () => Promise.reject(new Error('decode'))) })
    await uploadPhoto(blob(5_000_000, 'image/png'), d, callbacks())
    expect(d.requestTicket).toHaveBeenCalledWith('image/png', 5_000_000)
    expect(d.track).toHaveBeenCalledWith({ size_bucket: '1-5MB', compressed: false })
  })

  it('refuses >20MB and HEIC before uploading anything', async () => {
    const d = deps()
    await expect(uploadPhoto(blob(21 * 1024 * 1024, 'image/jpeg'), d, callbacks())).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' })
    await expect(uploadPhoto(blob(10, 'image/heic'), d, callbacks())).rejects.toMatchObject({ code: 'IMAGE_UNSUPPORTED' })
    expect(d.requestTicket).not.toHaveBeenCalled()
  })

  it('reports a failed PUT as UPLOAD_FAILED', async () => {
    const d = deps({ put: vi.fn(async () => Promise.reject(new Error('network'))) })
    await expect(uploadPhoto(blob(100, 'image/jpeg'), d, callbacks())).rejects.toMatchObject({ code: 'UPLOAD_FAILED' })
    expect(d.track).not.toHaveBeenCalled()
  })
})
