import { describe, expect, it } from 'vitest'

import { HOTEL_TEMPLATES, homeSpaces } from './home-spaces'
import { liveSpaces } from './home-spaces-live'
import { zhHomeSpaces } from './zh/home-spaces'

const covers = (id: string) => ({ id, coverBeforeUrl: `https://assets.test/covers/${id}/before.webp`, coverAfterUrl: `https://assets.test/covers/${id}/after.webp` })

describe('hotels block from live templates', () => {
  it('binds the same four templates, in the same order, on both pages', () => {
    const ids = Object.values(HOTEL_TEMPLATES)
    expect(homeSpaces.items.map((item) => item.template)).toEqual(ids)
    expect(zhHomeSpaces.items.map((item) => item.template)).toEqual(ids)
    expect(new Set(ids).size).toBe(4)
  })

  it('shows a live template’s own covers, keeping the case’s words and alt text', () => {
    const live = Object.values(HOTEL_TEMPLATES).map(covers)
    const shown = liveSpaces(homeSpaces, live)!
    shown.items.forEach((item, index) => {
      const source = homeSpaces.items[index]
      expect(item.before).toEqual({ src: covers(source.template!).coverBeforeUrl, alt: source.before.alt, width: 1600, height: 900 })
      expect(item.after).toEqual({ src: covers(source.template!).coverAfterUrl, alt: source.after.alt, width: 1600, height: 900 })
      expect([item.title, item.change]).toEqual([source.title, source.change])
    })
  })

  it('keeps the built-in pictures for a case whose template is not live or lacks a cover', () => {
    const live = [covers(HOTEL_TEMPLATES.room), { ...covers(HOTEL_TEMPLATES.lobby), coverAfterUrl: null }]
    const shown = liveSpaces(zhHomeSpaces, live)!
    expect(shown.items[0].before.src).toContain('/covers/')
    expect(shown.items.slice(1)).toEqual(zhHomeSpaces.items.slice(1))
    expect(liveSpaces(undefined, live)).toBeUndefined()
  })
})
