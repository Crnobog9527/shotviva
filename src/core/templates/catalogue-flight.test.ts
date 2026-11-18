import { beforeEach, expect, it, vi } from 'vitest'

import type { ConditionalJsonStore, StoredJson } from '../storage/conditional-json'
import { CatalogueCoordinationError, coordinateCatalogue, discardCatalogueFlight } from './catalogue-flight'

function memoryStore() {
  let current: StoredJson | null = null
  let revision = 0
  const store = {
    read: vi.fn(async () => current),
    write: vi.fn(async (_key: string, value: unknown, expected?: string | null) => {
      if (expected !== undefined && expected !== (current?.etag ?? null)) return null
      current = { etag: `revision-${++revision}`, value: structuredClone(value) }
      return current.etag
    }),
  } satisfies ConditionalJsonStore
  return store
}

function deferred<T>() {
  return Promise.withResolvers<T>()
}

beforeEach(() => vi.restoreAllMocks())

it('shares one origin read between simultaneous instances', async () => {
  const store = memoryStore()
  const result = deferred<string>()
  const origin = vi.fn(() => result.promise)
  const visitors = Array.from({ length: 40 }, () => coordinateCatalogue(store, origin))
  await vi.waitFor(() => expect(origin).toHaveBeenCalledTimes(1))
  result.resolve('current catalogue')
  expect(await Promise.all(visitors)).toEqual(Array(40).fill('current catalogue'))
  expect(origin).toHaveBeenCalledExactlyOnceWith()
})

it('fences a result started before a save and retries from fresh data', async () => {
  const store = memoryStore()
  const old = deferred<string>()
  const origin = vi.fn<() => Promise<string>>()
    .mockReturnValueOnce(old.promise).mockResolvedValueOnce('new catalogue')
  const beforeSave = coordinateCatalogue(store, origin)
  await vi.waitFor(() => expect(origin).toHaveBeenCalledExactlyOnceWith())
  await discardCatalogueFlight(store)
  const afterSave = coordinateCatalogue(store, origin)
  expect(await afterSave).toBe('new catalogue')
  old.resolve('obsolete catalogue')
  expect(await beforeSave).toBe('new catalogue')
  expect(origin).toHaveBeenCalledTimes(2)
})

it('lets concurrent cache misses use the result only within the brief sharing window', async () => {
  const store = memoryStore()
  const origin = vi.fn<() => Promise<string>>().mockResolvedValueOnce('old').mockResolvedValueOnce('new')
  const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
  expect(await coordinateCatalogue(store, origin)).toBe('old')
  now.mockReturnValue(1_100)
  expect(await coordinateCatalogue(store, origin)).toBe('old')
  now.mockReturnValue(4_000)
  expect(await coordinateCatalogue(store, origin)).toBe('new')
  expect(origin).toHaveBeenCalledTimes(2)
})

it('takes over an abandoned lease and preserves the cache revision', async () => {
  const store = memoryStore()
  await store.write('unused by mock', { phase: 'filling', owner: 'abandoned', revision: 'prior-revision', until: Date.now() - 60_000 })
  const origin = vi.fn(async () => 'recovered')
  expect(await coordinateCatalogue(store, origin)).toBe('recovered')
  expect(origin).toHaveBeenCalledExactlyOnceWith()
  expect((await store.read())?.value).toMatchObject({ phase: 'ready', revision: 'prior-revision' })
})

it('classifies an R2 failure after a successful origin read as a coordination error', async () => {
  const store = memoryStore()
  store.write.mockResolvedValueOnce('claimed').mockRejectedValueOnce(new Error('publication unavailable'))
  const origin = vi.fn(async () => 'loaded')
  await expect(coordinateCatalogue(store, origin)).rejects.toBeInstanceOf(CatalogueCoordinationError)
  expect(origin).toHaveBeenCalledTimes(1)
})

it('preserves origin errors for the caller', async () => {
  const store = memoryStore()
  const originError = new Error('database unavailable')
  const origin = vi.fn().mockRejectedValue(originError)
  await expect(coordinateCatalogue(store, origin)).rejects.toBe(originError)
  expect((await store.read())?.value).toMatchObject({ phase: 'failed' })
})

it('signals when storage is unavailable before attempting an origin read', async () => {
  const store = memoryStore()
  store.write.mockRejectedValue(new Error('unavailable'))
  const origin = vi.fn()
  await expect(coordinateCatalogue(store, origin)).rejects.toBeInstanceOf(CatalogueCoordinationError)
  expect(origin).not.toHaveBeenCalled()
})

it('classifies a storage error while a reader is already waiting', async () => {
  const store = memoryStore()
  await store.write('unused by mock', { phase: 'filling', owner: 'another-reader', revision: 'other', until: Date.now() + 5_000 })
  const active = await store.read()
  store.read.mockResolvedValueOnce(active).mockRejectedValueOnce(new Error('read unavailable'))
  const origin = vi.fn()
  await expect(coordinateCatalogue(store, origin)).rejects.toBeInstanceOf(CatalogueCoordinationError)
  expect(origin).not.toHaveBeenCalled()
})
