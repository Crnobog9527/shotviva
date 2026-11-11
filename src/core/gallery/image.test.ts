import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ shown: null as unknown }))
vi.mock('./reads', () => ({ shownImage: async () => mocks.shown }))

const { parseWidth, renderGalleryImage } = await import('./image')

describe('gallery image', () => {
  it('only offers the two sizes', () => {
    expect(parseWidth('960')).toBe(960)
    expect(parseWidth('4000')).toBe(480)
    expect(parseWidth(null)).toBe(480)
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
