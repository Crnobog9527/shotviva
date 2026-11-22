import { describe, expect, it, vi } from 'vitest'

import { shareLink } from './share-or-copy'

const data = { title: 'Spring menu', text: 'Spring menu on Shotviva' }
const url = 'https://shotviva.com/s/w/abc'

describe('shareLink', () => {
  it('opens the share sheet with the title, text and link', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const copy = vi.fn()
    expect(await shareLink(url, data, { share, copy })).toBe('shared')
    expect(share).toHaveBeenCalledWith({ ...data, url })
    expect(copy).not.toHaveBeenCalled()
  })

  it('does nothing when the user closes the sheet', async () => {
    const copy = vi.fn()
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('cancel'), { name: 'AbortError' }))
    expect(await shareLink(url, data, { share, copy })).toBe('cancelled')
    expect(copy).not.toHaveBeenCalled()
  })

  it('copies the link when the browser has no share sheet', async () => {
    const copy = vi.fn().mockResolvedValue(true)
    expect(await shareLink(url, data, { copy })).toBe('copied')
    expect(copy).toHaveBeenCalledWith(url)
  })

  it('copies the link when the share sheet fails', async () => {
    const copy = vi.fn().mockResolvedValue(true)
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    expect(await shareLink(url, data, { share, copy })).toBe('copied')
    expect(copy).toHaveBeenCalledWith(url)
  })

  it('reports a failure when the copy fails too', async () => {
    expect(await shareLink(url, data, { copy: vi.fn().mockResolvedValue(false) })).toBe('failed')
  })
})
