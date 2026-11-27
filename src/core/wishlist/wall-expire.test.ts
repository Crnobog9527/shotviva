import { describe, expect, it, vi } from 'vitest'

const revalidateTag = vi.fn()
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag }))
const { expireWallCache, WISHLIST_WALL_TAG } = await import('./wall')

// It runs after a vote or a review has committed, so it must never turn that into an error
// (review of #886: outside a Next request revalidateTag throws "static generation store missing").
describe('expireWallCache', () => {
  it('expires the shared wall', () => {
    expireWallCache()
    expect(revalidateTag).toHaveBeenCalledWith(WISHLIST_WALL_TAG, { expire: 0 })
  })

  it('never throws when revalidateTag does', () => {
    revalidateTag.mockImplementationOnce(() => { throw new Error('Invariant: static generation store missing') })
    expect(() => expireWallCache()).not.toThrow()
  })
})
