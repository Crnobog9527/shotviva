import { describe, expect, it, vi } from 'vitest'

import { canShareFile, handPhotoToSystem, mayShareFiles, resolveShareMode, shareFileFor } from './share-mode'

const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })
const prepared = () => Promise.resolve({ shareBlob: jpeg(), transparent: false })
const sharer = (canShare: (data?: ShareData) => boolean) => ({ share: vi.fn(), canShare: vi.fn(canShare) })

describe('Share or Download (MOBILE_UI_rules §1.8.1)', () => {
  it('shows Share when the browser can hand this exact file to the OS', async () => {
    const nav = sharer((data) => (data?.files?.length ?? 0) === 1)
    const mode = await resolveShareMode(nav, prepared, 'shotviva-qa')
    expect(mode.kind).toBe('share')
    expect(mode.kind === 'share' && [mode.file.name, mode.file.type]).toEqual(['shotviva-qa.jpg', 'image/jpeg'])
    expect(nav.canShare).toHaveBeenCalledWith({ files: [expect.any(File)] })
  })

  it('falls back to Download without fetching when the share API is missing', async () => {
    const load = vi.fn(prepared)
    for (const nav of [undefined, {}, { share: vi.fn() }, { canShare: () => true }]) {
      expect(await resolveShareMode(nav, load, 'x')).toEqual({ kind: 'download' })
    }
    expect(load).not.toHaveBeenCalled()
  })

  it('falls back to Download when the photo could not be read (e.g. R2 CORS blocked the fetch)', async () => {
    const nav = sharer(() => true)
    expect(await resolveShareMode(nav, () => Promise.resolve(null), 'x')).toEqual({ kind: 'download' })
    expect(await resolveShareMode(nav, () => Promise.reject(new TypeError('Load failed')), 'x')).toEqual({ kind: 'download' })
  })

  it('falls back to Download when canShare says no or throws for the file', async () => {
    expect(await resolveShareMode(sharer(() => false), prepared, 'x')).toEqual({ kind: 'download' })
    const throwing = sharer(() => {
      throw new TypeError('not allowed')
    })
    expect(canShareFile(throwing, shareFileFor(jpeg(), 'x'))).toBe(false)
    expect(await resolveShareMode(throwing, prepared, 'x')).toEqual({ kind: 'download' })
  })

  it('names the file after its real type when re-encoding fell back to the PNG', () => {
    const file = shareFileFor(new Blob([new Uint8Array([1])], { type: 'image/png' }), 'shotviva-qa')
    expect([file.name, file.type]).toEqual(['shotviva-qa.png', 'image/png'])
    expect(mayShareFiles({ share: () => undefined, canShare: () => true })).toBe(true)
  })
})

describe('saving a photo on iPhone', () => {
  it('hands only the prepared file to the system on the same click stack', async () => {
    const file = shareFileFor(jpeg(), 'photo')
    const share = vi.fn().mockResolvedValue(undefined)
    const result = handPhotoToSystem({ share }, file)
    expect(share).toHaveBeenCalledExactlyOnceWith({ files: [file] })
    await expect(result).resolves.toBe('closed')
  })

  it('keeps Save available after cancellation and offers the original if sharing is denied', async () => {
    for (const [name, outcome] of [['AbortError', 'closed'], ['NotAllowedError', 'unavailable']]) {
      const share = vi.fn().mockRejectedValue(new DOMException('Cannot share', name))
      await expect(handPhotoToSystem({ share }, shareFileFor(jpeg(), 'photo'))).resolves.toBe(outcome)
    }
  })
})
