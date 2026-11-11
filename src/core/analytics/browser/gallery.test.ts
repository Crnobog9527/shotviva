import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ env: 'production' as string | undefined, track: vi.fn() }))
vi.mock('../../public-env', () => ({ publicEnv: { get NEXT_PUBLIC_VERCEL_ENV() { return mocks.env } } }))
vi.mock('./client', () => ({ track: mocks.track }))

const { isStaffBrowser, trackGallery } = await import('./gallery')

// ARCHITECTURE §16.2 (T108): gallery events from real visitors on the live site only.
describe('trackGallery', () => {
  beforeEach(() => {
    mocks.env = 'production'
    mocks.track.mockReset()
    vi.stubGlobal('document', { cookie: '' })
  })

  it('sends on the live site for a normal visitor', () => {
    trackGallery('gallery_view', { page: 1 })
    expect(mocks.track).toHaveBeenCalledWith('gallery_view', { page: 1 })
  })

  it('drops the test site, previews and staff browsers', () => {
    mocks.env = 'preview'
    trackGallery('gallery_view', { page: 1 })
    mocks.env = 'production'
    vi.stubGlobal('document', { cookie: 'a=b; sv_staff=1' })
    trackGallery('gallery_reuse', { template_id: 'x', surface: 'work' })
    expect(mocks.track).not.toHaveBeenCalled()
  })

  it('reads the staff mark exactly', () => {
    expect(isStaffBrowser('sv_staff=1')).toBe(true)
    expect(isStaffBrowser('sv_staff=0; x_sv_staff=1')).toBe(false)
  })
})
