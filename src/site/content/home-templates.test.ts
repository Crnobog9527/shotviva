import { describe, expect, it } from 'vitest'

import { homePage } from './home'
import { homeTemplates } from './home-templates'

const live = (id: string, before: string | null = null, after: string | null = null) => ({ id, cover: { before, after } })

describe('homeTemplates', () => {
  it('gives every featured template a bundled pair, picking only the live ones', () => {
    const { cards, samples, defaultId } = homeTemplates(homePage, [live('qa-white-bg')])
    expect(Object.keys(cards)).toHaveLength(10)
    expect(cards['white-background']).toEqual({ before: '/home/templates/white-background-before.webp', after: '/home/templates/white-background-after.webp', live: false })
    expect(samples['korean-manhwa']?.after).toBe('/home/templates/korean-manhwa-after.webp')
    expect(defaultId).toBe('qa-white-bg')
  })

  it("uses the admin's cover when a featured template is live, and opens on White Background", () => {
    const { cards, defaultId } = homeTemplates(homePage, [live('lifestyle-table'), live('white-background', 'https://r2/b.webp', 'https://r2/a.webp')])
    expect(cards['white-background']).toEqual({ before: 'https://r2/b.webp', after: 'https://r2/a.webp', live: true })
    expect(cards['lifestyle-table']?.live).toBe(true)
    expect(defaultId).toBe('white-background')
  })

  it('has nothing to open on when no template is live', () => {
    expect(homeTemplates(homePage, []).defaultId).toBeNull()
  })
})
