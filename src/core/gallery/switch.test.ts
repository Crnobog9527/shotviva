import { describe, expect, it, vi } from 'vitest'

import { testSite } from '../seo/test-site'
import { decideGallery } from './switch'

// ARCHITECTURE §9 第 1 条 (T108): site.gallery.enabled && the admin switch, closed by default.

const without = testSite({ gallery: { enabled: false } })
const withGallery = testSite({ gallery: { enabled: true } })
const settings = (values: Record<string, unknown>) => vi.fn(async () => values)

describe('decideGallery', () => {
  it('a site without a gallery stays closed and never reads the switch', async () => {
    const on = settings({ gallery_enabled: true })
    expect(await decideGallery(without, on)).toBe(false)
    expect(on).not.toHaveBeenCalled()
  })

  it('follows the admin switch', async () => {
    expect(await decideGallery(withGallery, settings({ gallery_enabled: true }))).toBe(true)
    expect(await decideGallery(withGallery, settings({ gallery_enabled: false }))).toBe(false)
  })

  it('is closed when never saved, mistyped, or the read failed (no settings)', async () => {
    expect(await decideGallery(withGallery, settings({}))).toBe(false)
    expect(await decideGallery(withGallery, settings({ gallery_enabled: 'true' }))).toBe(false)
  })

  it('the auto-approve switch does not open the gallery', async () => {
    expect(await decideGallery(withGallery, settings({ gallery_auto_approve: true }))).toBe(false)
  })
})
