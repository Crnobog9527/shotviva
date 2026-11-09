import { expect, it } from 'vitest'
import { createMemoryStore } from '../../../../tests/fakes/memory-store'
import { executeCopies, planCopies } from './assets'

const base = 'https://example.test/assets'
const prefix = base + '/covers/original/'
const original = {
  cover_before_url: prefix + 'before.webp', cover_after_url: null, cover_video_url: prefix + 'movie.mp4',
  cover_poster_url: prefix + 'poster.webp', cover_locales: { zh: { after: prefix + 'zh.webp' }, en: {
    before: prefix + 'before.webp', video: prefix + 'en.webp', media: 'animated', poster: prefix + 'poster.webp',
  } },
  style_refs: ['12345678', 'abcdef12'].map(start => ({
    key: `style-refs/original/${start}-1234-4567-89ab-123456789abc.webp`,
    width: 10, height: 20, uploadedAt: '2026-11-10T00:00:00Z',
  })),
}

function setup() {
  const plan = planCopies('original', 'draft', base, original)
  const stores = { public: createMemoryStore(), private: createMemoryStore() }
  for (const [index, item] of plan.copies.entries()) stores[item.bucket].upload(item.from, Uint8Array.of(index), 'image/webp')
  return { plan, buckets: stores, stores: { public: stores.public.store, private: stores.private.store } }
}

it('copies common, motion and localized files once and keeps private refs in order, independent of source', async () => {
  const { stores, plan } = setup()
  expect(plan.copies).toHaveLength(7)
  expect(plan.assets.cover_locales.en.media).toBe('animated')
  expect(plan.assets.style_refs.map(ref => ref.key)).toEqual(original.style_refs.map(ref => ref.key.replace('/original/', '/draft/')))
  await executeCopies(stores, plan.copies)
  for (const file of plan.copies) {
    const store = stores[file.bucket]
    expect(await store.get(file.to)).toEqual(await store.get(file.from))
    await store.delete(file.to)
    expect(await store.head(file.from)).not.toBeNull()
  }
})

it('removes only the attempt’s copies if the private bucket fails after the covers were copied', async () => {
  const { stores, buckets, plan } = setup()
  buckets.private.failCopy.next = true
  await expect(executeCopies(stores, plan.copies)).rejects.toThrow()
  for (const file of plan.copies) {
    expect(await stores[file.bucket].head(file.to)).toBeNull()
    expect(await stores[file.bucket].head(file.from)).not.toBeNull()
  }
})

it.each([prefix + '../other/x.webp', prefix + '%2e%2e.webp', prefix + 'x.webp?k=1',
  base + '/covers/elsewhere/a.webp', 'https://untrusted.test/a.webp'])('rejects unsafe cover %s before any copy', url => {
  expect(() => planCopies('original', 'draft', base, { ...original, cover_before_url: url })).toThrow()
})

it('rejects even well-formed private keys if they belong to a different template', () => {
  const ref = original.style_refs[0]!
  expect(() => planCopies('original', 'draft', base, { ...original, style_refs: [{ ...ref, key: ref.key.replace('original', 'other') }] })).toThrow()
})
