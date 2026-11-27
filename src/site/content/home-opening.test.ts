import { describe, expect, it } from 'vitest'

import { bundleOpeningIds, generatorOpening } from './home-opening'

const live = (id: string, { covers = true, slots = false } = {}) => ({
  id, coverBeforeUrl: covers ? `/b/${id}.webp` : null, coverAfterUrl: covers ? `/a/${id}.webp` : null,
  fields: { images: { slots: slots ? [{ key: 'logo' }] : null } },
})
const catalogue = [live('steak'), live('cake'), live('bare', { covers: false }), live('poster', { slots: true }), live('soup')]

describe('the first-screen card\'s opening template (Owner 2026-11-26)', () => {
  it('draws only from live bundle members with both covers and no image slots, once each, in bundle order', () => {
    const ids = bundleOpeningIds(catalogue, [
      { id: 'b1', name: 'A', memberIds: ['cake', 'gone', 'bare', 'steak'] },
      { id: 'b2', name: 'B', memberIds: ['steak', 'poster', 'soup'] },
    ])
    expect(ids).toEqual(['cake', 'steak', 'soup'])
    for (const id of ids) {
      const template = catalogue.find((candidate) => candidate.id === id)
      expect(template?.coverBeforeUrl && template.coverAfterUrl).toBeTruthy()
    }
  })

  it('keeps a hero option\'s template first, then the first 首页精选 template', () => {
    expect(generatorOpening({ heroTemplate: 'anime', featuredId: 'hotel', bundleIds: ['cake', 'steak'] })).toEqual({ defaultId: 'anime', shuffle: false })
    expect(generatorOpening({ heroTemplate: null, featuredId: 'hotel', bundleIds: ['cake', 'steak'] })).toEqual({ defaultId: 'hotel', shuffle: false })
  })

  it('opens on the first bundle member and shuffles in the browser when there is more than one', () => {
    expect(generatorOpening({ heroTemplate: null, featuredId: null, bundleIds: ['cake', 'steak'] })).toEqual({ defaultId: 'cake', shuffle: true })
    expect(generatorOpening({ heroTemplate: null, featuredId: null, bundleIds: ['cake'] })).toEqual({ defaultId: 'cake', shuffle: false })
  })

  it('with no bundles and no 首页精选, leaves it to the rail\'s first template (never the catalogue\'s first)', () => {
    expect(generatorOpening({ heroTemplate: null, featuredId: null, bundleIds: [] })).toEqual({ defaultId: null, shuffle: false })
  })
})
