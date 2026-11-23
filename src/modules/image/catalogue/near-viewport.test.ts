import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const { DeferCoversUntilNear } = await import('./near-viewport')
const { PairMedia } = await import('./pair-media')
const { LoopPlate } = await import('./card-media')

const pair = (eager: boolean) => createElement(PairMedia, { before: 'https://x/covers/a/before.webp', after: 'https://x/covers/a/after.webp', alt: 'A', eager, sizes: '50vw' })
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
