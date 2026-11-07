import { describe, expect, it, vi } from 'vitest'

import { checkTicketImage, isHeic, uploadTicketImage, type TicketUploadDeps } from './upload-ticket-image'

// T69 picker side: ≤10 MB, JPEG / PNG / WebP / HEIC; HEIC must be decoded in the browser.

const MB = 1024 * 1024
const file = (type: string, size = 1000, name = 'photo') => new File([new Uint8Array(size)], name, { type })

function deps(compressed: Blob | null): TicketUploadDeps & { put: ReturnType<typeof vi.fn> } {
  return {
    compress: vi.fn(async () => {
      if (!compressed) throw new Error('cannot decode')
      return compressed
    }),
    requestTicket: vi.fn(async (contentType) => ({ input_key: `inputs/u/k.${contentType === 'image/jpeg' ? 'jpg' : 'png'}`, put_url: 'https://r2/put', headers: { 'Content-Type': contentType } })),
    put: vi.fn(async () => undefined),
  }
}

describe('checkTicketImage', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])('takes %s', (type) => {
    expect(() => checkTicketImage(file(type))).not.toThrow()
  })

  it('takes a .heic file the browser gave no type', () => {
    expect(isHeic(file('', 10, 'IMG_0001.HEIC'))).toBe(true)
    expect(() => checkTicketImage(file('', 10, 'IMG_0001.heic'))).not.toThrow()
  })

  it('refuses over 10 MB and anything that is not an image we can read', () => {
    expect(() => checkTicketImage({ type: 'image/jpeg', size: 10 * MB + 1 })).toThrow(expect.objectContaining({ code: 'IMAGE_TOO_LARGE' }))
    expect(() => checkTicketImage(file('application/pdf'))).toThrow(expect.objectContaining({ code: 'IMAGE_UNSUPPORTED' }))
    expect(() => checkTicketImage(file('image/gif'))).toThrow(expect.objectContaining({ code: 'IMAGE_UNSUPPORTED' }))
  })
})

describe('uploadTicketImage', () => {
  const signal = new AbortController().signal

  it('sends the browser’s JPEG re-encode and returns its key', async () => {
    const d = deps(new Blob([new Uint8Array(10)], { type: 'image/jpeg' }))
    await expect(uploadTicketImage(file('image/png'), () => {}, signal, d)).resolves.toBe('inputs/u/k.jpg')
    expect(d.requestTicket).toHaveBeenCalledWith('image/jpeg', 10)
  })

  it('turns a HEIC into JPEG in the browser', async () => {
    const d = deps(new Blob([new Uint8Array(20)], { type: 'image/jpeg' }))
    await expect(uploadTicketImage(file('image/heic'), () => {}, signal, d)).resolves.toBe('inputs/u/k.jpg')
  })

  it('refuses a HEIC the browser cannot decode instead of uploading it', async () => {
    const d = deps(null)
    await expect(uploadTicketImage(file('image/heic'), () => {}, signal, d)).rejects.toMatchObject({ code: 'IMAGE_UNSUPPORTED' })
    expect(d.requestTicket).not.toHaveBeenCalled()
  })

  it('falls back to the original JPEG / PNG / WebP when compression fails', async () => {
    const d = deps(null)
    await expect(uploadTicketImage(file('image/png', 500), () => {}, signal, d)).resolves.toBe('inputs/u/k.png')
    expect(d.requestTicket).toHaveBeenCalledWith('image/png', 500)
  })

  it('reports a failed PUT as UPLOAD_FAILED', async () => {
    const d = deps(new Blob([new Uint8Array(10)], { type: 'image/jpeg' }))
    d.put.mockRejectedValueOnce(new Error('network'))
    await expect(uploadTicketImage(file('image/jpeg'), () => {}, signal, d)).rejects.toMatchObject({ code: 'UPLOAD_FAILED' })
  })
})
