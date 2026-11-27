import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { HeroScene, ImageRef } from '../page-content'
import { HeroScenes } from './hero-scenes'

const img = (name: string): ImageRef => ({ src: `/home/${name}.webp`, alt: `AI example: ${name}`, width: 1080, height: 1350 })
const items: readonly [HeroScene, HeroScene, HeroScene] = [
  { image: img('street'), caption: 'Same bag, now on a street' },
  { image: img('terrace'), caption: 'Same bag, on a café table' },
  { image: img('villa'), caption: 'Same bag, new light' },
]
const html = renderToStaticMarkup(
  createElement(HeroScenes, {
    scenes: { label: 'AI scenes', items },
    tags: { phone: 'Phone', ai: 'AI' },
    sizes: '50vw',
    phonePane: createElement('span', { className: 'mk-pane' }, 'phone'),
  }),
)

describe('HeroScenes server HTML', () => {
  it('ships only the first AI scene as an image, eager but not preloaded', () => {
    expect(html.match(/<img/g)).toHaveLength(1)
    expect(html).toContain('alt="AI example: street"')
    expect(html).toContain('loading="eager"')
    expect(html).toMatch(/fetchPriority="low"|fetchpriority="low"/)
    expect(html).not.toContain('terrace.webp')
  })

  it('keeps every caption in the HTML with the first one shown', () => {
    for (const { caption } of items) expect(html).toContain(caption)
    expect(html).toContain('<span class="mk-on">Same bag, now on a street</span>')
  })

  it('has one labelled switch per scene, the first pressed', () => {
    expect(html).toContain('role="group" aria-label="AI scenes"')
    expect(html.match(/<button/g)).toHaveLength(3)
    expect(html).toContain('aria-label="Same bag, now on a street" aria-pressed="true"')
    expect(html).toContain('aria-label="Same bag, new light" aria-pressed="false"')
  })

  it('carries no illustrative badge on the picture', () => {
    expect(html).not.toMatch(/illustrative|示意图/i)
  })

  it('with a phone photo per scene, still ships only the first pair: the later photos wait for the browser', () => {
    const dishes: readonly [HeroScene, HeroScene] = [
      { image: img('dish-1-ai'), before: img('dish-1-photo'), caption: 'Dish one' },
      { image: img('dish-2-ai'), before: img('dish-2-photo'), caption: 'Dish two' },
    ]
    const out = renderToStaticMarkup(
      createElement(HeroScenes, { scenes: { label: 'Dishes', items: dishes }, tags: { phone: 'Phone', ai: 'AI' }, sizes: '50vw', phonePane: createElement('span', { className: 'mk-pane' }, 'phone') }),
    )
    expect(out.match(/<img/g)).toHaveLength(1)
    expect(out).not.toContain('dish-2')
    expect(out).not.toContain('mk-pstack')
  })
})
