import { describe, expect, it } from 'vitest'

import { homePage } from './home'
import { homeTemplates } from './home-templates'

const live = (id: string, before: string | null = null, after: string | null = null) => ({ id, cover: { before, after } })

describe('homeTemplates', () => {
  it('gives every featured template a bundled pair, picking only the live ones', () => {
    const { cards, samples, defaultId } = homeTemplates(homePage, [live('qa-white-bg')])
    expect(Object.keys(cards)).toHaveLength(10)
    expect(cards['pure-white']).toEqual({ before: '/home/templates/pure-white-before.webp', after: '/home/templates/pure-white-after.webp', live: false })
    expect(samples['korean-manhwa']?.after).toBe('/home/templates/korean-manhwa-after.webp')
    expect(defaultId).toBe('qa-white-bg')
  })

  it("uses the admin's cover when a featured template is live, and opens on Pure White", () => {
    const { cards, defaultId } = homeTemplates(homePage, [live('lifestyle-table'), live('pure-white', 'https://r2/b.webp', 'https://r2/a.webp')])
    expect(cards['pure-white']).toEqual({ before: 'https://r2/b.webp', after: 'https://r2/a.webp', live: true })
    expect(cards['lifestyle-table']?.live).toBe(true)
    expect(defaultId).toBe('pure-white')
  })

  it('has nothing to open on when no template is live', () => {
    expect(homeTemplates(homePage, []).defaultId).toBeNull()
  })
})
