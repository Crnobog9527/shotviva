import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BannerBar } from './banner-bar'

// The phone layout (banner.css) puts the link on its own row under the message, so the link must
// be the message's sibling, not inside its paragraph; only short messages get phrase-level breaks.

const render = (message: string, link: { url: string; label: string | null } | null) =>
  renderToStaticMarkup(createElement(BannerBar, { message, link, tone: 'promo', dismissLabel: 'Close' }))

describe('BannerBar', () => {
  it('renders the link after the message paragraph, not inside it', () => {
    const html = render('Launch offer: up to 40% off yearly plans.', { url: 'https://example.test/deal', label: 'Lock in the deal' })
    expect(html).toContain('<p>Launch offer: up to 40% off yearly plans.</p><a href="https://example.test/deal" class="sv-ann-pill"')
    expect(html.indexOf('sv-ann-pill')).toBeLessThan(html.indexOf('sv-ann-x'))
  })

  it('renders no pill without a link', () => {
    expect(render('Maintenance tonight.', null)).not.toContain('sv-ann-pill')
  })

  it('marks short messages for phrase-level breaks and leaves long ones alone', () => {
    expect(render('Shotviva发布优惠：年付会员最高可省 40%。', null)).toContain('sv-ann-short')
    expect(render('Launch offer: up to 40% off yearly plans.', null)).toContain('sv-ann-short')
    // Chinese counts double: 33 characters are as wide as 66 Latin ones.
    expect(render('长'.repeat(32), null)).toContain('sv-ann-short')
    expect(render('长'.repeat(33), null)).not.toContain('sv-ann-short')
    expect(render('a'.repeat(65), null)).not.toContain('sv-ann-short')
  })

  it('stacks the link under a long message at every width, never under a short one', () => {
    const deal = { url: 'https://example.test/deal', label: 'Deal' }
    expect(render('a'.repeat(65), deal)).toContain('sv-ann-stack')
    expect(render('a'.repeat(65), null)).not.toContain('sv-ann-stack')
    expect(render('Launch offer: up to 40% off yearly plans.', deal)).not.toContain('sv-ann-stack')
  })
})
