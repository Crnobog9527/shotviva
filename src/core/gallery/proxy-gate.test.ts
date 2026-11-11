import { describe, expect, it, vi } from 'vitest'

import { testSite } from '../seo/test-site'
import { createGalleryGate, galleryWorkIdOf, SWITCH_TTL_MS } from './proxy-gate'

const id = '0b6f2f8e-6a3f-4c1e-9d55-1f2a3b4c5d6e'

describe('galleryWorkIdOf', () => {
  it('finds the work id of a /g address in either language', () => {
    expect(galleryWorkIdOf(`/g/${id}`)).toBe(id)
    expect(galleryWorkIdOf(`/zh/g/${id}/`)).toBe(id)
  })

  it('marks a malformed id, and ignores other paths', () => {
    expect(galleryWorkIdOf('/g/not-a-uuid')).toBe('')
    expect(galleryWorkIdOf(`/g/${id}/extra`)).toBeNull()
    expect(galleryWorkIdOf('/gallery')).toBeNull()
    expect(galleryWorkIdOf(`/generate/${id}`)).toBeNull()
  })
})

// 总控 review of #498: no database read without a gallery, none per request while closed, and the
// switch read at most once per SWITCH_TTL_MS.
describe('createGalleryGate', () => {
  function gate(open: boolean | Error, shown = true, site = testSite({ gallery: { enabled: true } })) {
    let clock = 0
    const readOpen = vi.fn(async () => {
      if (open instanceof Error) throw open
      return open
    })
    const readShown = vi.fn(async () => shown)
    const check = createGalleryGate(site, { readOpen, readShown, now: () => clock })
    return { check, readOpen, readShown, tick: (ms: number) => (clock += ms) }
  }

  it('reads nothing on a site without a gallery', async () => {
    const g = gate(true, true, testSite({ gallery: { enabled: false } }))
    expect(await g.check(id)).toBe(false)
    expect(g.readOpen).not.toHaveBeenCalled()
    expect(g.readShown).not.toHaveBeenCalled()
  })

  it('while closed, reads the switch once per TTL and never the work', async () => {
    const g = gate(false)
    for (let i = 0; i < 5; i++) expect(await g.check(id)).toBe(false)
    expect(g.readOpen).toHaveBeenCalledTimes(1)
    expect(g.readShown).not.toHaveBeenCalled()
    g.tick(SWITCH_TTL_MS)
    await g.check(id)
    expect(g.readOpen).toHaveBeenCalledTimes(2)
  })

  it('while open, reads the work per request and answers whether it is shown', async () => {
    const g = gate(true, true)
    expect(await g.check(id)).toBe(true)
    expect(await g.check(id)).toBe(true)
    expect(g.readOpen).toHaveBeenCalledTimes(1)
    expect(g.readShown).toHaveBeenCalledTimes(2)
    const hidden = gate(true, false)
    expect(await hidden.check(id)).toBe(false)
  })

  it('a failed switch read closes it for the TTL (no hammering during an outage)', async () => {
    const g = gate(new Error('down'))
    expect(await g.check(id)).toBe(false)
    expect(await g.check(id)).toBe(false)
    expect(g.readOpen).toHaveBeenCalledTimes(1)
    expect(g.readShown).not.toHaveBeenCalled()
  })
})
