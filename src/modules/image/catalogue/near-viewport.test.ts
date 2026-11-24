import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const { DeferCoversUntilNear, scrollingRail } = await import('./near-viewport')
const { PairMedia } = await import('./pair-media')
const { LoopPlate } = await import('./card-media')

const pair = (eager: boolean, priority = false) => createElement(PairMedia, { before: 'https://x/covers/a/before.webp', after: 'https://x/covers/a/after.webp', alt: 'A', eager, priority, sizes: '50vw' })
const imgs = (html: string) => html.match(/<img\b[^>]*>/g) ?? []

// First render (no effects): what a card puts on the page before IntersectionObserver answers.
describe('cover loading in Create', () => {
  it('outside Create a card renders its pictures as before', () => {
    expect(imgs(renderToStaticMarkup(pair(false))).length).toBeGreaterThan(0)
  })

  it('inside Create an off-screen card has no pictures yet, only its frame', () => {
    const html = renderToStaticMarkup(createElement(DeferCoversUntilNear, null, pair(false)))
    expect(imgs(html)).toEqual([])
    expect(html).toContain('aspect-[8/5]')
  })

  it('a first-screen (eager) card loads at once, at normal priority', () => {
    const tags = imgs(renderToStaticMarkup(createElement(DeferCoversUntilNear, null, pair(true))))
    expect(tags.length).toBeGreaterThan(0)
    for (const tag of tags) expect(tag).not.toMatch(/fetchpriority/i)
  })

  it('the first card (priority) loads at once, at high priority', () => {
    const tags = imgs(renderToStaticMarkup(createElement(DeferCoversUntilNear, null, pair(true, true))))
    expect(tags.length).toBeGreaterThan(0)
    for (const tag of tags) {
      expect(tag).toMatch(/loading="eager"/)
      expect(tag).toMatch(/fetchPriority="high"|fetchpriority="high"/)
    }
  })

  it('priority never raises a card that is not on the first screen', () => {
    for (const tag of imgs(renderToStaticMarkup(pair(false, true)))) expect(tag).toMatch(/fetchPriority="low"|fetchpriority="low"/)
  })

  it('lazy covers outside the first screen go at low priority', () => {
    for (const tag of imgs(renderToStaticMarkup(pair(false)))) {
      expect(tag).toMatch(/loading="lazy"/)
      expect(tag).toMatch(/fetchPriority="low"|fetchpriority="low"/)
    }
  })
})

// The Quiet Loop rule for animated WebP covers: the still poster until the card is half in view.
describe('animated covers', () => {
  it('start as their still poster, never the animation', () => {
    const template = { cover: { type: 'image' as const, before: null, after: null, motion: 'https://x/covers/m/loop.webp', poster: 'https://x/covers/m/poster.webp' } }
    const html = renderToStaticMarkup(createElement(LoopPlate, { template: template as never, alt: 'M', sizes: '100vw' }))
    expect(html).not.toContain('loop.webp')
    expect(html).toContain('poster')
  })
})

// A card inside a sideways scroller (a phone category rail, the member picker's row) is watched
// against that scroller: the viewport's margin does not reach past its clip (review of #884).
describe('the scroller a card sits in', () => {
  type Node = { parentElement: Node | null; overflowX: string; scrollWidth: number; clientWidth: number }
  const node = (overflowX: string, scrollWidth: number, clientWidth: number, parentElement: Node | null = null): Node => ({ parentElement, overflowX, scrollWidth, clientWidth })
  const style = (element: Element) => ({ overflowX: (element as unknown as Node).overflowX })

  it('finds the nearest ancestor that scrolls sideways', () => {
    const page = node('visible', 390, 390)
    const rail = node('auto', 1400, 390, page)
    const card = node('visible', 280, 280, node('visible', 280, 280, rail))
    expect(scrollingRail(card as unknown as Element, style)).toBe(rail)
  })

  it('ignores a scroller with nothing to scroll (the picker as a grid from md) and plain columns', () => {
    const grid = node('auto', 600, 600, node('visible', 1000, 1000))
    expect(scrollingRail(node('visible', 100, 100, grid) as unknown as Element, style)).toBeNull()
    expect(scrollingRail(node('visible', 100, 100, node('hidden', 900, 390)) as unknown as Element, style)).toBeNull()
  })
})
