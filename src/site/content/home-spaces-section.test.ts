import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { HOTEL_OPEN_ATTR } from '@/core/content/blocks/hotel-cases-dom'
import { SpacesSection } from '@/core/content/blocks/spaces-section'

import { homeSpaces } from './home-spaces'
import { zhHomeSpaces } from './zh/home-spaces'

const count = (html: string, needle: string) => html.split(needle).length - 1

describe('hotels list', () => {
  it.each([
    ['en', homeSpaces, 'Real phone photo', 'See all 4'],
    ['zh', zhHomeSpaces, '真实手机照', '查看全部 4 个'],
  ] as const)('%s: four cases, each one button with a small phone-photo/result pair, and "see all"', (_, spaces, phoneLabel, more) => {
    const html = renderToStaticMarkup(createElement(SpacesSection, { spaces }))
    expect(count(html, '<button type="button" class="hc-case"')).toBe(4)
    for (const [index, item] of spaces.items.entries()) {
      const button = html.indexOf(`class="hc-case" ${HOTEL_OPEN_ATTR}="${index}"`)
      const before = html.indexOf(`alt="${item.before.alt}"`)
      const after = html.indexOf(`alt="${item.after.alt}"`)
      // Phone photo first (left), result second (right), inside its own button.
      expect(button).toBeGreaterThan(-1)
      expect(before).toBeGreaterThan(button)
      expect(after).toBeGreaterThan(before)
    }
    expect(count(html, `>${phoneLabel}<`)).toBe(4)
    expect(count(html, 'class="hc-tag hc-ai" aria-hidden="true">AI<')).toBe(4)
    expect(html).toContain(`<button type="button" class="hc-more" ${HOTEL_OPEN_ATTR}="0">${more}</button>`)
    // Every thumbnail lazy: the block is below the first screen.
    expect(count(html, 'loading="lazy"')).toBe(8)
    // Nothing of the viewer is in the page: no dialog, no full-size addresses, no viewer words.
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('data-full')
    expect(html).not.toMatch(/aria-(haspopup|describedby|label)=/)
  })
})
