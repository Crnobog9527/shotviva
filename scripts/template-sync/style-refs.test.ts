import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import { createMemoryStore } from '../../tests/fakes/memory-store'
import { copyStyleRefs } from './style-refs'

const webp = (width: number, height: number, red = 200) =>
  sharp({ create: { width, height, channels: 3, background: { r: red, g: 10, b: 10 } } }).webp().toBuffer().then((b) => new Uint8Array(b))
const key = (id: string, n: number) => `style-refs/${id}/5a1c2b3d-4e5f-4a6b-8c7d-9e0f1a2b3c4${n}.webp`
const ref = (id: string, n: number, width = 64, height = 48) => ({ key: key(id, n), width, height, uploadedAt: '2026-11-12T00:00:00.000Z' })

async function sides() {
  const source = createMemoryStore()
  const target = createMemoryStore()
  await source.store.put(key('demo', 1), await webp(64, 48), 'image/webp')
  await source.store.put(key('demo', 2), await webp(64, 48, 90), 'image/webp')
  return { source: source.store, target: target.store }
}

describe('copyStyleRefs', () => {
  it('copies each reference to the same key, and a re-run writes nothing', async () => {
    const { source, target } = await sides()
    const refs = [ref('demo', 1), ref('demo', 2)]
    expect(await copyStyleRefs('demo', refs, source, target)).toBe(2)
    expect(await target.get(key('demo', 2))).toEqual(await source.get(key('demo', 2)))
    expect(await target.head(key('demo', 1))).toMatchObject({ contentType: 'image/webp' })
    const put = vi.spyOn(target, 'put')
    expect(await copyStyleRefs('demo', refs, source, target)).toBe(0)
    expect(put).not.toHaveBeenCalled()
  })

  it('never overwrites a production key holding other bytes', async () => {
    const { source, target } = await sides()
    await target.put(key('demo', 1), await webp(64, 48, 30), 'image/webp')
    await expect(copyStyleRefs('demo', [ref('demo', 1)], source, target)).rejects.toMatchObject({ message: 'STYLE_REF_CONFLICT' })
    expect(await target.get(key('demo', 1))).toEqual(await webp(64, 48, 30))
  })

  it.each([
    ['a key outside the template\'s prefix', ref('other', 1), 'INVALID_STYLE_REFS'],
    ['a missing object', ref('demo', 9), 'STYLE_REF_MISSING'],
    ['a size other than the row says', ref('demo', 1, 32, 48), 'INVALID_STYLE_REF_OBJECT'],
  ])('rejects %s and writes nothing', async (_, bad, reason) => {
    const { source, target } = await sides()
    const put = vi.spyOn(target, 'put')
    await expect(copyStyleRefs('demo', [bad], source, target)).rejects.toMatchObject({ message: reason })
    expect(put).not.toHaveBeenCalled()
  })

  it('rejects an object that is not a WebP', async () => {
    const { source, target } = await sides()
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#fff' } }).png().toBuffer()
    await source.put(key('demo', 3), new Uint8Array(png), 'image/webp')
    await expect(copyStyleRefs('demo', [ref('demo', 3)], source, target)).rejects.toMatchObject({ message: 'INVALID_STYLE_REF_OBJECT' })
  })
})
