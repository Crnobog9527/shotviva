import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { png } from '../../../tests/fakes/images'
import { createMemoryStore } from '../../../tests/fakes/memory-store'

const mocks = vi.hoisted(() => ({ shown: null as unknown }))
vi.mock('./reads', () => ({ shownImage: async () => mocks.shown }))

const { parseImageQuery, renderGalleryImage } = await import('./image')
const { galleryVariantKey } = await import('./variants')

const OUTPUT = 'outputs/u/x.png'
const noSuchKey = () => Object.assign(new Error('gone'), { name: 'NoSuchKey' })

// R2 says NoSuchKey for a missing object; the memory fake's message alone is not enough.
function r2Like() {
  const memory = createMemoryStore()
  const get = vi.fn(async (key: string) => {
    if (!memory.objects.has(key)) throw noSuchKey()
    return memory.store.get(key)
  })
  return { ...memory, store: { ...memory.store, get } }
}

function deps(store: ReturnType<typeof r2Like>['store']) {
  const tasks: (() => Promise<unknown>)[] = []
  return { deps: { store, defer: (task: () => Promise<unknown>) => tasks.push(task) }, runDeferred: () => Promise.all(tasks.map((task) => task())) }
}

beforeEach(() => {
  mocks.shown = null
})

describe('gallery image', () => {
  it('only takes exactly w=480 or w=960, so the query cannot bust the CDN', () => {
    const q = (s: string) => parseImageQuery(new URLSearchParams(s))
    expect(q('w=480')).toBe(480)
    expect(q('w=960')).toBe(960)
    for (const bad of ['', 'w=4000', 'w=480&x=1', 'w=480&w=960', 'w=0480', 'x=1']) expect(q(bad)).toBeNull()
  })

  it('is nothing for a work the gallery does not show, and for a file already gone', async () => {
    const r2 = r2Like()
    const { deps: d } = deps(r2.store)
    expect(await renderGalleryImage(d, 'x', 480)).toBeNull()
    expect(r2.store.get).not.toHaveBeenCalled()
    mocks.shown = { outputKey: OUTPUT, creditPool: 'free' }
    expect(await renderGalleryImage(d, 'x', 480)).toBeNull()
    r2.store.get.mockRejectedValueOnce(noSuchKey()).mockRejectedValueOnce(new Error('network'))
    await expect(renderGalleryImage(d, 'x', 480)).rejects.toThrow('network')
  })

  it('serves the ready-made copy as is, without touching the original', async () => {
    const r2 = r2Like()
    const ready = new Uint8Array([1, 2, 3])
    r2.upload(galleryVariantKey(OUTPUT, 960), ready, 'image/webp')
    mocks.shown = { outputKey: OUTPUT, creditPool: 'free' }
    const { deps: d } = deps(r2.store)
    expect(await renderGalleryImage(d, 'x', 960)).toEqual(ready)
    expect(r2.store.get).toHaveBeenCalledTimes(1)
    expect(r2.store.get).toHaveBeenCalledWith(galleryVariantKey(OUTPUT, 960))
  })

  it('without a copy, renders from the original and writes both copies after the response', async () => {
    const r2 = r2Like()
    r2.upload(OUTPUT, await png(1200, 1500), 'image/png')
    mocks.shown = { outputKey: OUTPUT, creditPool: 'paid' }
    const { deps: d, runDeferred } = deps(r2.store)
    const body = await renderGalleryImage(d, 'x', 480)
    expect(await sharp(body!).metadata()).toMatchObject({ format: 'webp', width: 480 })
    expect(r2.objects.has(galleryVariantKey(OUTPUT, 480))).toBe(false)
    await runDeferred()
    expect(r2.objects.get(galleryVariantKey(OUTPUT, 480))?.body).toEqual(body)
    expect(await sharp(r2.objects.get(galleryVariantKey(OUTPUT, 960))!.body).metadata()).toMatchObject({ format: 'webp', width: 960 })
    // The next miss reads the copy.
    expect(await renderGalleryImage(d, 'x', 960)).toEqual(r2.objects.get(galleryVariantKey(OUTPUT, 960))!.body)
  })

  it('falls back to the render when reading the copy fails for another reason', async () => {
    const r2 = r2Like()
    r2.upload(OUTPUT, await png(600, 600), 'image/png')
    mocks.shown = { outputKey: OUTPUT, creditPool: 'free' }
    r2.store.get.mockRejectedValueOnce(new Error('timeout'))
    const { deps: d } = deps(r2.store)
    expect(await sharp((await renderGalleryImage(d, 'x', 480))!).metadata()).toMatchObject({ format: 'webp', width: 480 })
  })
})
