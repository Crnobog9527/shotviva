import { expect, it } from 'vitest'

import { createMemoryStore } from '../../tests/fakes/memory-store'
import { copyCovers } from './covers'
import { parseIds } from './sync'

const source = { base: 'https://preview.test', ...createMemoryStore() }
const target = { base: 'https://target.test/assets', ...createMemoryStore() }
const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13])
it('copies all cover slots to immutable destination URLs and deduplicates shared files', async () => {
  const key = 'covers/demo/cover.png'
  source.upload(key, png, 'image/png')
  const url = source.base + '/' + key
  const covers = await copyCovers('demo', { cover_before_url: url, cover_after_url: null,
    cover_video_url: null, cover_poster_url: null, cover_locales: { zh: { before: url, after: url } } }, source, target)
  expect(covers.cover_before_url).toMatch(/^https:\/\/target\.test\/assets\/covers\/demo\/sync-[0-9a-f]{64}\.png$/)
  expect(covers.cover_locales.zh).toEqual({ before: covers.cover_before_url, after: covers.cover_before_url })
  expect([...target.objects.values()]).toEqual([{ body: png, contentType: 'image/png' }])
})

it.each(['https://other.test/covers/demo/t.png', 'https://preview.test/uploads/p.png',
  'https://preview.test/covers/demo/../p.png', 'https://preview.test/covers/demo/p.png?x=1'])('rejects foreign or unsafe cover paths', async url => {
  await expect(copyCovers('demo', { cover_before_url: url, cover_after_url: null, cover_video_url: null,
    cover_poster_url: null, cover_locales: {} }, source, target)).rejects.toThrow('INVALID_COVER_URL')
})

it('only accepts whole template IDs and removes duplicates', () => {
  expect(parseIds('food-demo, test\nfood-demo')).toEqual(['food-demo', 'test'])
  for (const invalid of ['', 'food; bad', '$(echo)']) expect(() => parseIds(invalid)).toThrow()
})
