import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ site: { features: { wishlist: true } } }))
vi.mock('@/site/site.config', () => ({ site: mocks.site }))

const { default: WishlistLayout } = await import('./layout')

describe('wishlist layout (ARCHITECTURE §15.6)', () => {
  it('404s every wishlist page while the feature is off', () => {
    mocks.site.features.wishlist = false
    expect(() => WishlistLayout({ children: 'wall', params: Promise.resolve({}) })).toThrow(
      expect.objectContaining({ digest: expect.stringMatching(/404/) }),
    )
  })

  it('renders the page while it is on', () => {
    mocks.site.features.wishlist = true
    expect(WishlistLayout({ children: 'wall', params: Promise.resolve({}) })).toBe('wall')
  })
})
