import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { CardVisual as Visual, ImageRef } from '../page-content'
import { CardVisual } from './card-visual'

const image = (name: string): ImageRef => ({ src: `/cases/${name}.webp`, alt: `${name} alt`, width: 1080, height: 1350 })
const render = (visual: Visual) => renderToStaticMarkup(createElement(CardVisual, { visual }))

// The pictures that lead a how-to point (Owner 2026-11-12) sit below the fold.
describe('CardVisual', () => {
  it('loads every picture lazily', () => {
    const html = render({ kind: 'pair', before: image('a'), after: image('b'), tags: { before: 'Phone photo', after: 'Listing' } })
    const imgs = html.match(/<img[^>]*>/g) ?? []
    expect(imgs).toHaveLength(2)
    for (const tag of imgs) expect(tag).toContain('loading="lazy"')
    expect(html).toContain('alt="a alt"')
    expect(html).toContain('>Listing<')
  })

  it('draws the sizes largest first, at their true share, with one described copy', () => {
    const tiers = [
      { name: 'Standard', px: 1024 },
      { name: 'HD', px: 2048 },
      { name: 'Max', px: 2880 },
    ] as const
    const html = render({ kind: 'sizes', image: image('s'), tiers })
    expect([...html.matchAll(/--r:([\d.]+)/g)].map((match) => Number(match[1]).toFixed(3))).toEqual(['1.000', '0.711', '0.356'])
    expect([...html.matchAll(/<b>(\d+)<\/b>/g)].map((match) => match[1])).toEqual(['2880', '2048', '1024'])
    expect(html.match(/alt="s alt"/g)).toHaveLength(1)
    expect(html.match(/alt=""/g)).toHaveLength(2)
  })

  it('lights only the picked template and names it for screen readers', () => {
    const tiles = [
      { image: image('t1'), name: 'White Background' },
      { image: image('t2'), name: 'Lifestyle Table' },
      { image: image('t3'), name: 'Promo Poster' },
    ] as const
    const html = render({ kind: 'picker', tiles, picked: 1, caption: 'Lifestyle Table picked' })
    expect(html.match(/class="xv-on"/g)).toHaveLength(1)
    expect(html).toMatch(/class="xv-on"><img[^>]*>Lifestyle Table<svg/)
    expect(html).toContain('<figcaption class="sr-only">Lifestyle Table picked</figcaption>')
  })
})
