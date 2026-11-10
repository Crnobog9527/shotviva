import { describe, expect, it } from 'vitest'

import { homeWishlist } from './home-wishlist'
import { zhHomeWishlist } from './zh/home-wishlist'

// Our own words only: an example wish is a shop owner talking ("a poster I can reuse every week"),
// not a promise from us, so the timeline guard skips the wish texts.
const text = (block: typeof homeWishlist) => JSON.stringify({ ...block, examples: block.examples.map(({ image }) => image) })

describe('home wishlist section copy (Owner 2026-11-10)', () => {
  it.each([
    ['en', homeWishlist, /illustrative/],
    ['zh', zhHomeWishlist, /示意/],
  ] as const)('%s: three points, eight square examples with one shipped, examples disclosed in alt text', (_, block, disclosure) => {
    expect(block.points).toHaveLength(3)
    expect(block.examples).toHaveLength(8)
    expect(block.examples.filter((wish) => wish.shipped)).toHaveLength(1)
    for (const wish of block.examples) {
      expect(wish.image.alt).toMatch(disclosure)
      expect(wish.image.width).toBe(wish.image.height)
    }
  })

  it('promises no timeline and no notifications (ARCHITECTURE §15.4)', () => {
    expect(text(homeWishlist)).not.toMatch(/\b(days?|weeks?|hours?|email|notify|notification)\b/i)
    expect(text(zhHomeWishlist)).not.toMatch(/天内|周内|小时|邮件|通知/)
  })

  it('keeps English out of the Chinese section', () => {
    const values = JSON.stringify({ ...zhHomeWishlist, examples: zhHomeWishlist.examples.map(({ text, image }) => [text, image.alt]) })
    expect(values.replace(/"src":"[^"]+"/g, '')).not.toMatch(/[A-Za-z]{4,} [A-Za-z]{3,}/)
  })
})
