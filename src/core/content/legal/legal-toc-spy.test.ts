import { describe, expect, it } from 'vitest'

import { tocMaxHeight } from './legal-toc-spy'

// The desktop contents column at 1280×800 with its sticky top at 88px (T45 follow-up).
describe('tocMaxHeight', () => {
  it('leaves the column its full room while the text runs past the screen', () => {
    expect(tocMaxHeight(88, 5000)).toBe(4896)
  })

  it('shrinks it to the space above the end of the text, so it never moves up under the app bar', () => {
    expect(tocMaxHeight(88, 506)).toBe(402)
    expect(tocMaxHeight(88, 90)).toBe(0)
  })
})
