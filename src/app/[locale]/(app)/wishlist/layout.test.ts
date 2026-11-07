import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ site: { features: { wishlist: true } }, settings: { wishlist_enabled: true } as Record<string, unknown> }))
vi.mock('@/site/site.config', () => ({ site: mocks.site }))
vi.mock('@/core/system-settings/read', () => ({ cachedSystemSettings: async () => mocks.settings }))

const { default: WishlistLayout } = await import('./layout')

const render = () => WishlistLayout({ children: 'wall', params: Promise.resolve({ locale: 'en' }) })
const notFound = expect.objectContaining({ digest: expect.stringMatching(/404/) })

describe('wishlist layout (ARCHITECTURE §15.6)', () => {
  it('404s every wishlist page while the site has no wishlist', async () => {
    mocks.site.features.wishlist = false
    mocks.settings = { wishlist_enabled: true }
    await expect(render()).rejects.toEqual(notFound)
  })

  it('404s every wishlist page while the admin switch is off', async () => {
    mocks.site.features.wishlist = true
    mocks.settings = { wishlist_enabled: false }
    await expect(render()).rejects.toEqual(notFound)
  })

  it('renders the page while it is on', async () => {
    mocks.site.features.wishlist = true
    mocks.settings = { wishlist_enabled: true }
    await expect(render()).resolves.toBe('wall')
  })
})
