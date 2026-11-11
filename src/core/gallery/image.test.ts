import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ shown: null as unknown }))
vi.mock('./reads', () => ({ shownImage: async () => mocks.shown }))

const { parseImageQuery, renderGalleryImage } = await import('./image')

describe('gallery image', () => {
  it('only takes exactly w=480 or w=960, so the query cannot bust the CDN', () => {
    const q = (s: string) => parseImageQuery(new URLSearchParams(s))
    expect(q('w=480')).toBe(480)
    expect(q('w=960')).toBe(960)
    for (const bad of ['', 'w=4000', 'w=480&x=1', 'w=480&w=960', 'w=0480', 'x=1']) expect(q(bad)).toBeNull()
  })

  it('is nothing for a work the gallery does not show, and for a file already gone', async () => {
    const store = { get: vi.fn() }
    expect(await renderGalleryImage(store, 'x', 480)).toBeNull()
    expect(store.get).not.toHaveBeenCalled()
    mocks.shown = { outputKey: 'outputs/u/x.png', creditPool: 'free' }
    store.get.mockRejectedValueOnce(Object.assign(new Error('gone'), { name: 'NoSuchKey' }))
    expect(await renderGalleryImage(store, 'x', 480)).toBeNull()
    store.get.mockRejectedValueOnce(new Error('network'))
    await expect(renderGalleryImage(store, 'x', 480)).rejects.toThrow('network')
  })
})
