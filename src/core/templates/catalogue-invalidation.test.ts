import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ updateTag: vi.fn(), revalidateTag: vi.fn(), write: vi.fn(), waitOut: vi.fn() }))
vi.mock('next/cache', () => ({ updateTag: mocks.updateTag, revalidateTag: mocks.revalidateTag }))
vi.mock('../storage/r2-store', () => ({ r2ConditionalJson: () => ({ write: mocks.write }) }))
vi.mock('./catalogue-flight', async (original) => ({ ...await original<typeof import('./catalogue-flight')>(), waitOutCatalogueFlight: mocks.waitOut }))

import { revalidateCatalogueTag, updateCatalogueTag } from './catalogue-invalidation'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.write.mockResolvedValue('new-generation')
})

it('invalidates the coordination object before the authoritative admin cache tag', async () => {
  await updateCatalogueTag('templates')
  expect(mocks.write).toHaveBeenCalledExactlyOnceWith(expect.any(String), expect.objectContaining({ phase: 'invalidated' }))
  expect(mocks.write.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateTag.mock.invocationCallOrder[0])
  expect(mocks.updateTag).toHaveBeenCalledExactlyOnceWith('templates')
})

it('waits out the previous generation if the invalidation write fails', async () => {
  const drained = Promise.withResolvers<void>()
  mocks.write.mockRejectedValue(new Error('storage unavailable'))
  mocks.waitOut.mockReturnValue(drained.promise)
  const pending = revalidateCatalogueTag('providers')
  await vi.waitFor(() => expect(mocks.waitOut).toHaveBeenCalledTimes(1))
  expect(mocks.revalidateTag).not.toHaveBeenCalled()
  drained.resolve()
  await pending
  expect(mocks.revalidateTag).toHaveBeenCalledExactlyOnceWith('providers', { expire: 0 })
})
