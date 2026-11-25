import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { HOTEL_CASE_ATTR, HOTEL_FULL_ATTR } from '@/core/content/blocks/hotel-cases-dom'
import { SpacesSection } from '@/core/content/blocks/spaces-section'

import { homeSpaces } from './home-spaces'
import { zhHomeSpaces } from './zh/home-spaces'


const count = (html: string, needle: string) => html.split(needle).length - 1

describe('hotels list', () => {
  it.each([
    ['en', homeSpaces, 'Real phone photo'],
    ['zh', zhHomeSpaces, '真实手机照'],
  ] as const)('%s: four cases, each one button with a small phone-photo/result pair the viewer can read', (_, spaces, phoneLabel) => {
    const html = renderToStaticMarkup(createElement(SpacesSection, { spaces }))
    expect(count(html, `${HOTEL_CASE_ATTR}="`)).toBe(4)
    expect(count(html, '<button type="button" class="hc-case"')).toBe(4)
    expect(count(html, 'aria-haspopup="dialog"')).toBe(4)
    // Phone photo first (left), result second (right), each carrying its full picture's address.
    for (const item of spaces.items) {
      const before = html.indexOf(`${HOTEL_FULL_ATTR}="${item.before.src}"`)
      const after = html.indexOf(`${HOTEL_FULL_ATTR}="${item.after.src}"`)
      expect(before).toBeGreaterThan(-1)
      expect(after).toBeGreaterThan(before)
    }
    expect(count(html, `>${phoneLabel}<`)).toBe(4)
    expect(count(html, 'class="hc-tag hc-tag-ai" aria-hidden="true">AI<')).toBe(4)
    // Every thumbnail lazy: the block is below the first screen.
    expect(count(html, 'loading="lazy"')).toBe(8)
    // The viewer's code is not in the list: nothing of the dialog renders on the server.
    expect(html).not.toContain('role="dialog"')
  })

  it('names each button after its case, in the page’s language', () => {
    const en = renderToStaticMarkup(createElement(SpacesSection, { spaces: homeSpaces }))
    const zh = renderToStaticMarkup(createElement(SpacesSection, { spaces: zhHomeSpaces }))
    expect(en).toContain('aria-label="View Guest room full size"')
    expect(zh).toContain('aria-label="查看「客房」大图"')
  })
})
